import './ui.css';
import { Game } from './game';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

new Game(container);
