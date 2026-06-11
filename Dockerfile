FROM node:22-alpine AS ui
WORKDIR /ui
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
COPY --from=ui /ui/dist ./web/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /dockwatch .

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /dockwatch /dockwatch
EXPOSE 9622
ENTRYPOINT ["/dockwatch"]
