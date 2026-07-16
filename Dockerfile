# Build the Beacon server binary.
FROM rust:1.80-slim AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin beacon-server

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/beacon-server /usr/local/bin/beacon-server
EXPOSE 3000
ENTRYPOINT ["beacon-server"]
