package config

import (
	"github.com/caarlos0/env/v10"
	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL   string `env:"DATABASE_URL"`
	MQTTBrokerURL string `env:"MQTT_BROKER_URL"`
	MQTTUsername  string `env:"MQTT_USERNAME"`
	MQTTPassword  string `env:"MQTT_PASSWORD"`
	MQTTClientID  string `env:"MQTT_CLIENT_ID"`
	HTTPAddr      string `env:"HTTP_ADDR"`
}

func Load() *Config {
	appConfig := &Config{}
	_ = godotenv.Load()

	if err := env.Parse(appConfig); err != nil {
		panic(err)
	}

	return appConfig
}
