CREATE TABLE IF NOT EXISTS "IntegrationConfig" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "provider" varchar NOT NULL,
  "instanceUrl" text NOT NULL,
  "encryptedCredentials" text,
  "securityContext" text,
  "securityContexts" json DEFAULT '[]'::json NOT NULL,
  "status" varchar DEFAULT 'disconnected' NOT NULL,
  "lastTestedAt" timestamp,
  "updatedAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL,
  CONSTRAINT "IntegrationConfig_userId_provider_unique" UNIQUE("userId","provider")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
