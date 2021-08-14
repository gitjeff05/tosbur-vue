import { createApp } from 'vue'
import App from './App.vue'


const version = window.tosbur.getDockerVersion().then((f) => {
    console.log('fetched docker version', f);
})
    .catch(() => {
        console.warn(`Could not get Docker version`);
    });

console.log(version)

createApp(App).mount('#app')
