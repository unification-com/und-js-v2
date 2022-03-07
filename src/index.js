import { UndClient as und } from "./client"
import * as crypto from "./crypto"

und.crypto = crypto
export const UndClient = und
