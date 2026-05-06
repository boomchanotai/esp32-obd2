// Package main runs the HTTP API and MQTT worker.
//
//	@title			ESP32 OBD2 Cloud API
//	@version		1.0
//	@description	REST API for OBD2 devices, telemetry, and alerts.
//	@servers.url	/api
//
//go:generate go run github.com/swaggo/swag/v2/cmd/swag@v2.0.0-rc4 init --v3.1 -g main.go -o ../docs -d .,../internal/handlers,../internal/models
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	httpSwagger "github.com/swaggo/http-swagger"

	_ "github.com/esp32-obd2/cloud/docs"

	"github.com/esp32-obd2/cloud/internal/config"
	"github.com/esp32-obd2/cloud/internal/handlers"
	"github.com/esp32-obd2/cloud/internal/store"
	"github.com/esp32-obd2/cloud/internal/worker"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db ping: %v", err)
	}

	st := store.New(pool)

	var w *worker.Worker
	mqttOpts := mqtt.NewClientOptions().
		AddBroker(cfg.MQTTBrokerURL).
		SetClientID(cfg.MQTTClientID).
		SetUsername(cfg.MQTTUsername).
		SetPassword(cfg.MQTTPassword).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetOrderMatters(false).
		SetOnConnectHandler(func(mqtt.Client) {
			if w == nil {
				return
			}
			if err := w.Subscribe(); err != nil {
				log.Printf("mqtt subscribe: %v", err)
				return
			}
			log.Println("mqtt subscribed obd2/+/telemetry")
		})

	mqttClient := mqtt.NewClient(mqttOpts)
	w = worker.New(st, mqttClient)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	h := handlers.New(st)
	r.Mount("/api", h.Routes())
	r.Get("/swagger/*", httpSwagger.WrapHandler)

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: r}

	go func() {
		token := mqttClient.Connect()
		if token.Wait() && token.Error() != nil {
			log.Fatalf("mqtt connect: %v", token.Error())
		}
	}()

	go func() {
		log.Printf("http listening on %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	shCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shCtx)
	mqttClient.Disconnect(250)
}
