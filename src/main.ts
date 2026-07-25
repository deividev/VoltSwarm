import './ui.css';
import { loadProfile } from './profile';
import { migrateRunHistory } from './run-history';
import { Game } from './game';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// Before the Game exists: every pool and socket reads PROFILE, so stored
// progress has to be in place first.
migrateRunHistory();
loadProfile();

new Game(container);
