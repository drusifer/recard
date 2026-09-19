#!/usr/bin/env node
// US-120: prints every example Gin state's evaluation (exampleStates.mjs)
// as JSON - the source of docs/GIN_STRATEGY.md's example table.
//
//   node tools/gin/examples.mjs          # assumed Jev answers, labelled so
//   TYPESAFE_API_KEY=... node tools/gin/examples.mjs   # live Jev
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { evaluateExamples } from './exampleStates.mjs';

const judge = process.env.TYPESAFE_API_KEY ? new TypeSafeClient() : undefined;
process.stdout.write(`${JSON.stringify(await evaluateExamples({ judge }), null, 2)}\n`);
