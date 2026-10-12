FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.20
RUN adduser -D -H app
WORKDIR /app
COPY --from=build /out/server /app/server
USER app
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["/app/server"]
