// Node 22.6+. Representative live rules-7 battles; full evidence in measure-roster.
import { measure } from './measure-roster.mjs';
for (const tier of [2,3,4,5]) console.log(JSON.stringify(measure((tier-1)*10+1,tier,['melee','ranged','swarm','healer'],tier,2)));
