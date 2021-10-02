const { contextBridge, ipcRenderer, ipcMain } = require('electron');
const got = require('got');
const fs = require('fs');

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
    console.error(`handling GOT error ${error.name}`)
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
    console.error(Object.keys(error));
    console.log(error.timings)
    console.error(`handling error ${error.name} ${error.code} ${error.options}`)
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

async function isPathValid(path) {
    try {
        fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
        return true;
    } catch (err) {
        throw new Error(err)
    }
}

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
* Create a container
* @param {Object} startup object ({ image, mount })
*/
async function createContainer(imageSettings) {
    try {
        // const json = createImageSettings(startup, imageSettings);
        console.log('attempt to create container', imageSettings);
        let json = { ...imageSettings, AttachStdout: true, Tty: true }
        json = JSON.stringify(json);
        console.log(JSON.parse(json))
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/create`;
        return await got.post(requestUrl, { json: JSON.parse(json) }).json();
    } catch (error) {
        console.error(`Error creating container ${error.message}`)
        handleError(error);
    }
}

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
        console.error(`Error starting container ${error.message}`);
        console.log(error.response.body);
        handleError(error);
    }
}

/**
 * Kill a container
 * @param {String} id 
 */
async function killContainer(id) {
    try {
        console.log('attempt to kill container', id);
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/${id}/kill`;
        const body = await got.post(requestUrl);
        ipcRenderer.send('destroy-embedded-view')
        return body;
    } catch (error) {
        handleError(error);
    }
}

async function listProcessesInContainer(id) {
    try {
        console.log('attempt to get list of running processes in container', id)
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/${id}/top`;
        return await got.get(requestUrl).json()
    } catch (error) {
        handleError(error);
    }
}

async function inspectContainer(id) {
    try {
        console.log('attempt to inspect container', id)
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/${id}/json`;
        return await got.get(requestUrl).json()
    } catch (error) {
        handleError(error);
    }
}

async function getContainerLogs(id) {
    try {
        console.log('get container logs', id)
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/containers/${id}/logs?stdout=true`;
        return await got.get(requestUrl)
    } catch (error) {
        handleError(error);
    }
}

const getLocalJupyterURL = (str) => {
    const matches = str.match(
        /http:\/\/(?:[0-9]{1,3}\.){3}[0-9]{1,3}:8888\/lab\?token.*/gm
    );
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
            ipcRenderer.send('open-jupyter', JSON.stringify({ ...container, ip }));
        }
        return response;
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

async function inspectImage(id) {
    try {
        const response = await got(`${process.env.DOCKER_IPC_SOCKET}/${process.env.API_VERSION}/images/${id}/json`);
        return JSON.parse(response.body);
    } catch (error) {
        handleError(error);
    }
}

async function hideEmbeddedView(view) {
    ipcRenderer.send('hide-embedded-view', JSON.stringify({ view }));
}

async function showEmbeddedView(view) {
    ipcRenderer.send('show-embedded-view', JSON.stringify({ view }))
}

contextBridge.exposeInMainWorld('tosbur', {
    getDockerVersion,
    getImages,
    getContainers,
    getEvents,
    createContainer,
    startContainer,
    attachToContainer,
    killContainer,
    inspectImage,
    listProcessesInContainer,
    inspectContainer,
    getContainerLogs,
    isPathValid,
    hideEmbeddedView,
    showEmbeddedView,
    title: 'Tosbur'
});