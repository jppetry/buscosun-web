#!/usr/bin/env node
/** seal.mjs — writes the seal of a protocol folder (once, when the protocol is frozen; a later change is P2). */
import { sealProtocol, protocolDir } from './lib/protokoll.mjs';
import { parseArgs } from './lib/common.mjs';
const args = parseArgs();
const seal = sealProtocol(protocolDir(args.protokoll ? String(args.protokoll) : 'p1'));
console.log(`versiegelt: ${seal.hash}`);
