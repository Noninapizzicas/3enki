mod auth;
mod bridge;
mod config;
mod dispatch;

use auth::TokenStore;
use bridge::AppState;
use config::Config;
use dispatch::Dispatcher;

use axum::middleware;
use axum::routing::{get, post};
use axum::Router;
use rumqttc::{AsyncClient, Event, MqttOptions, Packet};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    let config = Config::from_env();

    let token_store = match TokenStore::load(&config.token_path) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            tracing::error!("token: {e}");
            std::process::exit(1);
        }
    };

    let mut opts = MqttOptions::new("motor-hermes", &config.broker_host, config.broker_port);
    opts.set_keep_alive(Duration::from_secs(30));
    let (client, mut eventloop) = AsyncClient::new(opts, 128);

    let dispatcher = Arc::new(Dispatcher::new(client.clone(), config.topic_prefix.clone()));
    dispatcher.subscribe_responses().await;

    let resp_prefix = dispatcher.response_topic_prefix();
    let cat_prefix = dispatcher.catalog_response_prefix();

    let config = Arc::new(config);
    let state = Arc::new(AppState {
        dispatcher: dispatcher.clone(),
        config: config.clone(),
        catalog_cache: RwLock::new(Default::default()),
    });

    let auth_store = token_store.clone();
    let protected = Router::new()
        .route("/execute", post(bridge::handle_execute))
        .route("/catalog", get(bridge::handle_catalog))
        .layer(middleware::from_fn(move |req, next| {
            let store = auth_store.clone();
            auth::auth_middleware(store, req, next)
        }));

    let app = Router::new()
        .merge(protected)
        .route("/health", get(bridge::handle_health))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.http_port);
    tracing::info!("motor-hermes v{VERSION} → http://{addr}");
    tracing::info!("MQTT broker: mqtt://{}:{}", config.broker_host, config.broker_port);

    let mqtt_dispatcher = dispatcher.clone();
    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Packet::Publish(p))) => {
                    let topic = &p.topic;
                    if topic.starts_with(resp_prefix.as_str())
                        || topic.starts_with(cat_prefix.as_str())
                    {
                        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&p.payload) {
                            if let Some(rid) = v.get("request_id").and_then(|r| r.as_str()) {
                                mqtt_dispatcher.route_response(rid, &v).await;
                            }
                        }
                    }
                }
                Ok(Event::Incoming(Packet::ConnAck(_))) => {
                    mqtt_dispatcher.subscribe_responses().await;
                    tracing::info!("reconectado al broker");
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("broker caído ({e}); reintento en 2s");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    });

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM handler");
        tokio::select! {
            _ = ctrl_c => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    ctrl_c.await.ok();
    tracing::info!("shutting down");
}
