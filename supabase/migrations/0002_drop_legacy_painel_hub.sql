-- Remove o esquema antigo do "Painel Hub" (todas as tabelas estavam vazias e sem uso).
-- O projeto foi reaproveitado como SOVEREIGN.

drop table if exists public.whatsapp_messages cascade;
drop table if exists public.whatsapp_conversations cascade;
drop table if exists public.channel_stats cascade;
drop table if exists public.products cascade;
drop table if exists public.logs cascade;
drop table if exists public.customers cascade;
drop table if exists public.orders cascade;
drop table if exists public.notifications cascade;
drop table if exists public.sessions cascade;
drop table if exists public.backups cascade;
drop table if exists public.api_logs cascade;
drop table if exists public.system_logs cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.deals cascade;
drop table if exists public.pipeline_stages cascade;
drop table if exists public.pipelines cascade;
drop table if exists public.contacts cascade;
drop table if exists public.webhook_executions cascade;
drop table if exists public.webhooks cascade;
drop table if exists public.flow_executions cascade;
drop table if exists public.flow_versions cascade;
drop table if exists public.flows cascade;
drop table if exists public.prompt_versions cascade;
drop table if exists public.prompts cascade;
drop table if exists public.ai_models cascade;
drop table if exists public.channels cascade;
drop table if exists public.integrations cascade;
drop table if exists public.configurations cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.roles cascade;
drop table if exists public.users cascade;
drop table if exists public.dashboard_stats cascade;
drop table if exists public.active_conversations cascade;
