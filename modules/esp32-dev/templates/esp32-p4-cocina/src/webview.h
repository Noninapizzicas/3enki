/**
 * WebView Browser
 */

#pragma once

#include <stdbool.h>

void webview_init(const char *url);
void webview_show_fullscreen();
void webview_post_message(const char *channel, const char *message);
void webview_reload();
void webview_navigate(const char *url);
void webview_shutdown();
