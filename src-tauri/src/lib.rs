mod app;
mod auth;
mod config;
mod detection;
mod logger;
mod models;
mod sharefile_api;
mod sharefile_models;
mod source;
mod sync_engine;

pub fn run() {
    app::run()
}
