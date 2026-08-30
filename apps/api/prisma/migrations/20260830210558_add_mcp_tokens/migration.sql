-- CreateTable
CREATE TABLE "mcp_tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_id" TEXT NOT NULL,

    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tokens_hash_key" ON "mcp_tokens"("hash");

-- CreateIndex
CREATE INDEX "mcp_tokens_membership_id_idx" ON "mcp_tokens"("membership_id");

-- AddForeignKey
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "workspace_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
