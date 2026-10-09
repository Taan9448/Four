import { App } from './ui/app';
import { watchForUpdate } from './ui/update-check';

new App(document.getElementById('app')!);
watchForUpdate();
