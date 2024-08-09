# Docker

_NOTE:_ Tailscale won't start locally in the Docker image on MacOS because it doesn't have /dev/net/tun that Tailscale needs.

Build the image

```sh
docker build -t musaa .
```

Run the image in a container

```sh
docker run -p 4343:3000 -d musaa
```

See running docker containers

```sh
docker ps
```

Get a shell inside the container

```sh
docker exec -it <id> /bin/sh
```

Read the logs of the container

```sh
docker logs <id>
```

# Fly.io

Login

```sh
fly auth login
```

Launch the app

```sh
fly launch
```

Deploy the app

```sh
npm run deploy
```

Deploying the app with --local-only flag might work if the remote builder does not respond in time.

```sh
npm run deploy:local
```

# Local credentials for HTTPS

Generate SSL Certificates

```sh
openssl req -x509 -newkey rsa:4096 -keyout keytmp.pem -out cert.pem -days 365
```

Decrypt key

```sh
openssl rsa -in keytmp.pem -out key.pem
```
