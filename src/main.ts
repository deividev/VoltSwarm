import './ui.css';
import { loadProfile } from './profile';
import { migrateRunHistory } from './run-history';
import { backfillGrantedRewards, settleContracts } from './contracts';
import { Game } from './game';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// Before the Game exists: every pool and socket reads PROFILE, so stored
// progress has to be in place first.
migrateRunHistory();
loadProfile();
// Settle any backlog at boot as well as at end of run. Without this there is a
// window where the Contracts screen reads COMPLETE while the reward has not
// been handed over — which happens whenever a contract ships that the player
// already satisfied, or after a save is restored.
// Recover payout records for contracts settled before they were tracked, so an
// older save does not show its finished ladder rungs as "Claimed" with no icon.
backfillGrantedRewards();
settleContracts();

new Game(container);
