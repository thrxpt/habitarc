import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Transaction } from "./database";
import { mutationReceipt } from "./schema";

export type MutationRequest = Pick<
  typeof mutationReceipt.$inferInsert,
  "actorId" | "requestKey" | "operation" | "payloadFingerprint"
>;

export const readMutationReceipt = async (
  transaction: Transaction,
  request: MutationRequest
) => {
  const [existing] = await transaction
    .select()
    .from(mutationReceipt)
    .where(
      and(
        eq(mutationReceipt.actorId, request.actorId),
        eq(mutationReceipt.requestKey, request.requestKey)
      )
    );
  if (existing === undefined) {
    return { kind: "new" } as const;
  }
  if (
    existing.operation !== request.operation ||
    existing.payloadFingerprint !== request.payloadFingerprint
  ) {
    return { kind: "conflict" } as const;
  }
  return { kind: "applied", resourceId: existing.resourceId } as const;
};

export const saveMutationReceipt = async (
  transaction: Transaction,
  request: MutationRequest,
  resourceId: string
) => {
  await transaction.insert(mutationReceipt).values({
    ...request,
    id: randomUUID(),
    resourceId,
    status: "applied",
  });
};
