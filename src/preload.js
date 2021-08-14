const { contextBridge } = require('electron');
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
        const requestUrl = `${process.env.DOCKER_IPC_SOCKET}/version`;
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
        const response = await got(`${process.env.DOCKER_IPC_SOCKET}/events?since=1628265000`);
        const res = JSON.parse(response.body);
        console.info(res)
        return res;
    } catch (error) {
        handleError(error);
    }
}

async function getContainers() {
    const endpoint = `${process.env.DOCKER_IPC_SOCKET}/containers/json`;
    console.log(`Attempt to fetch containers from ${endpoint}`);
    try {
        const body = await got(endpoint).json();
        return body;
    } catch (error) {
        handleError(error);
    }
}

async function getImages() {
    try {
        const response = await got(`${process.env.DOCKER_IPC_SOCKET}/images/json?all=true`);
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
    title: 'Tosbur'
});
