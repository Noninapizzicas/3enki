use std::time::Duration;

pub struct Config {
    pub http_port: u16,
    pub broker_host: String,
    pub broker_port: u16,
    pub token_path: String,
    pub topic_prefix: String,
    pub default_timeout: Duration,
    pub code_timeout: Duration,
    pub agent_timeout: Duration,
    pub catalog_ttl: Duration,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            http_port: env_parse("MOTOR_HERMES_HTTP_PORT", 8130),
            broker_host: env_str("MOTOR_HERMES_BROKER", "127.0.0.1"),
            broker_port: env_parse("MOTOR_HERMES_BROKER_PORT", 1883),
            token_path: env_str("MOTOR_HERMES_TOKEN_PATH", "data/.hermes-bridge-token"),
            topic_prefix: env_str("MOTOR_HERMES_TOPIC_PREFIX", "hermes"),
            default_timeout: Duration::from_millis(env_parse("MOTOR_HERMES_TIMEOUT_MS", 15000)),
            code_timeout: Duration::from_millis(env_parse("MOTOR_HERMES_CODE_TIMEOUT_MS", 65000)),
            agent_timeout: Duration::from_millis(env_parse("MOTOR_HERMES_AGENT_TIMEOUT_MS", 300000)),
            catalog_ttl: Duration::from_millis(env_parse("MOTOR_HERMES_CATALOG_TTL_MS", 60000)),
        }
    }

    pub fn timeout_for(&self, tool_name: &str) -> Duration {
        match tool_name {
            "code.orquestar" => self.code_timeout,
            "invoke_agent" => self.agent_timeout,
            _ => self.default_timeout,
        }
    }
}

fn env_str(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}
