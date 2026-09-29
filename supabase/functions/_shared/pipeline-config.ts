import { resolvePipelineRules } from './content-rules.ts';

// Loads the business's timezone + content_pipeline config and resolves it
// into PipelineRules. Throws if the pipeline isn't configured.
export async function loadPipelineRules(supabase: any, businessId: string) {
  const [{ data: biz }, { data: cfg }] = await Promise.all([
    supabase.from('businesses').select('timezone').eq('id', businessId).maybeSingle(),
    supabase.from('business_config').select('config').eq('business_id', businessId).maybeSingle(),
  ]);
  return resolvePipelineRules(cfg && cfg.config, (biz && biz.timezone) || 'Europe/Istanbul');
}
