# tosbur-vue

The electron wrapper for electron-web 

## Project setup
```
yarn install
```

### Compiles and hot-reloads for development
```
yarn electron:serve
```

### Build electron app

1. First, copy `dist` from `tosbur-web` to `./static/` so that the tree looks like:

```
❯ tree -L 2 static
static
└── dist
    ├── assets
    ├── favicon.ico
    └── index.html
```

cp -R ../tosbur-web/dist ./static

2. Removing leading slashes in references in ./static/dist/index.html  

3. Export environment variables:

export DOCKER_IPC_SOCKET='http://unix:/var/run/docker.sock:'
export API_VERSION='v1.41'

4. Build
```
yarn electron:build
```

# Project setup

Project was setup with `electron-builder` and [vue-cli-plugin-electron-builder](https://nklayman.github.io/vue-cli-plugin-electron-builder/).

This was helpful to get going with the project, but `vue-cli-plugin-electron-builder` may be moot now. Once it was determined that electron-builder can load any file or url, regardless of how or where it was built, the decision was made to build the web application in a separate repository using Vite. This web application is housed in the `tosbur-web` repository.

## Todos (Build related)

1. Investigate the impact of entirely removing `vue-cli-plugin-electron-builder`.
2. Should web app dist be sent to `./public`?
3. Why do leading slashed have to be removed when using `file:///` in build?
4. Export env variables should not be necessary.
5. Icon
6. Developer certificate