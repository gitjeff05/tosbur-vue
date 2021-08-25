const { contextBridge, ipcRenderer } = require('electron');
const got = require('got');

// List of possible GOT errors
const gotErrors = [
    'TimeoutError',
    'CancelError',
    'UnsupportedProtocolError',
    'CacheError',
    'RequestError',
    'ReadError',
    'ParseError',
    'HTTPError',
    'MaxRedirectsError'
];

const handleGotError = (error) => {
    if (error.name === "RequestError" && error.code === "ECONNREFUSED" && error.options.socketPath === "/var/run/docker.sock") {
        console.warn(`Cannot connect to Docker. Is it running?`);
    }
    let errorMsg = `${error.code}: ${error.name} - ${error.message}`
    console.error(errorMsg);
    throw error;
};

/**
 * Print out a nice error from the response object and rethrow
 * @param {Object} error
 */
const handleError = (error) => {
    /**
     * handle a GOT error
     */
    if (error.options && gotErrors.includes(error.name) && error.code) {
        return handleGotError(error);
    }
    let response = error.response
        ? error.response
        : JSON.parse(error.message).response;
    const body = JSON.parse(response.body);
    const errorMsg = `${body.message} ${response.url}`;
    console.error(`API error ${errorMsg}`);
    throw new Error(errorMsg);
};


/**
 * Get the version of docker.
 */
async function getDockerVersion() {
    try {
        console.log(`Getting docker version`);
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/version`;
        const { body, statusCode } = await got(requestUrl, {
            responseType: 'json'
        });
        if (statusCode === 200 && body) {
            return body;
        }
    } catch (error) {
        handleError(error);
    }
}

async function getEvents() {
    try {
        const response = await got(`${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/events?since=1628265000`);
        const res = JSON.parse(response.body);
        console.info(res)
        return res;
    } catch (error) {
        handleError(error);
    }
}

async function getContainers() {
    const endpoint = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/json`;
    console.log(`Attempt to fetch containers from ${endpoint}`);
    try {
        const body = await got(endpoint).json();
        return body;
    } catch (error) {
        handleError(error);
    }
}

/**
 * Settings for create image.
 * It is unclear what effect some of these parameters (e.g., AttachStdin)
 * since we are invoking this via REST.
 * https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate
 * The ExposedPorts and HostConfig may require changing per container.
 */
const imageSettings = {
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: false,
    ExposedPorts: {
        '8888/tcp': {}
    },
    HostConfig: {
        PortBindings: {
            '8888/tcp': [
                {
                    HostIp: '127.0.0.1',
                    HostPort: '8888'
                }
            ]
        }
    },
    Tty: true,
    OpenStdin: false,
};

/**
 * Override default settings for creating image
 * @param {Object} startup settings (image, mount)
 * @param {Object} imageSettings - default settings
 */
const createImageSettings = (startup, imageSettings) => {
    console.log('preload: imageSettings', imageSettings)
    const { mount, image } = startup;
    const { HostConfig } = imageSettings;
    const bindMount = `${mount}:/home/jovyan/`;
    const hostConfig = { ...HostConfig, Binds: [bindMount] };
    return { ...imageSettings, HostConfig: hostConfig, Image: image };
};

/**
 * Start a container
 * @param {Object} container to start
 */
async function startContainer(container) {
    const { Id } = container;
    try {
        console.log(`starting container: ${Id}`);
        const { statusCode, complete, requestUrl } = await got.post(
            `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/${Id}/start`
        );

        if (statusCode === 204 && complete) {
            return { Id, statusCode, complete };
        }
        handleError(`Start container returned status ${statusCode}`, requestUrl);
    } catch (error) {
        handleError(error);
    }
}

const getLocalJupyterURL = (str) => {
    const matches = str.match(
        /http:\/\/(?:[0-9]{1,3}\.){3}[0-9]{1,3}:8888\/lab\?token.*/gm
    );
    console.log(matches);
    if (!matches) {
        console.info(str);
        throw new Error('Could not extract Jupyter IP address');
    }
    return matches[0];
};

/**
 * Attach to container
 * Sends the 'open-jupyter' message to the main process with the payload containing the ip address of the jupyter notebook.
 * @param {String} container
 */
async function attachToContainer(container) {
    let { Id } = container;
    try {
        console.log(`attempt to attach container ${Id}`);
        const endpoint = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/${Id}/attach?logs=true&stdout=true`;
        // Do not parse the body as json because this is console output.
        const response = await got.post(endpoint);
        if (response.body) {
            const ip = getLocalJupyterURL(response.body);
            console.log(ip);
            ipcRenderer.send('open-jupyter', JSON.stringify({ ...container, ip }));
        }
        return response;
    } catch (error) {
        handleError(error);
    }
}

/**
* Create a container
* @param {Object} startup object ({ image, mount })
*/
async function createContainer(startup) {
    try {
        const json = createImageSettings(startup, imageSettings);
        console.log('attempt to create container', json);
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/create`;
        const body = await got.post(requestUrl, { json }).json();
        return body;
    } catch (error) {
        handleError(error);
    }
}

async function getImages() {
    try {
        const response = await got(`${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/images/json?all=true`);
        return JSON.parse(response.body);
    } catch (error) {
        handleError(error);
    }
}

async function getImageInspect(id) {
    try {
        const response = await got(`${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/images/${id}/json`);
        return JSON.parse(response.body);
    } catch (error) {
        handleError(error);
    }
}

contextBridge.exposeInMainWorld('tosbur', {
    getDockerVersion,
    getImages,
    getContainers,
    getEvents,
    createContainer,
    startContainer,
    attachToContainer,
    getImageInspect,
    title: 'Tosbur'
});
