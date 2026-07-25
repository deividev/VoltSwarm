import './ui.css';
import { loadAccount } from './account';
import { Game } from './game';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// Before the Game exists: every pool and socket reads ACCOUNT, so stored
// progress has to be in place first.
loadAccount();

new Game(container);
