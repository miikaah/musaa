# Docker

_NOTE_ Tailscale won't start locally in the Docker image on MacOS because it doesn't have /dev/net/tun that Tailscale needs.

Build the image

```
docker build -t musaa .
```

Run the image in a container

```
docker run -p 4343:3000 -d musaa
```

See running docker container

```
docker ps
```

Get a shell inside the container

```
docker exec -it <id> /bin/sh
```

Read the logs of the container

```
docker logs <id>
```

# Fly.io

Login

```
fly auth login
```

Launch the app

```
fly launch
```

Deploy the app

```
fly deploy
```
