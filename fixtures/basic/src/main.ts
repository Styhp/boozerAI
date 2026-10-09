// Entry point for the sample stock report. Fixture data only: never run.
import './tripwire';
import './styles.css';
import config from './config';
import type { Item } from './inventory';
import { buildReport } from './report';
import { join } from 'node:path';

const items: Item[] = [];
console.log(join(config.outputDir, 'report.txt'), buildReport(items));
