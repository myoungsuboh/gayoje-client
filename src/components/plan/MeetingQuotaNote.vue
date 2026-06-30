<script setup>
defineProps({
  meetingUsed: { type: Number, default: 0 },
  meetingLimit: { type: Number, default: 0 },
  meetingRemaining: { type: Number, default: 0 },
  meetingPct: { type: Number, default: 0 },
  daysUntilReset: { type: Number, default: null },
  tierLabel: { type: String, default: '' },
})
</script>

<template>
  <div
    class="meeting-quota-note"
    :class="{
      'meeting-quota-note--warning': meetingPct >= 80 && meetingPct < 100,
      'meeting-quota-note--danger': meetingPct >= 100,
    }"
    :title="(daysUntilReset != null && daysUntilReset > 0)
      ? $t('plan.quota.title_reset', { tier: tierLabel, used: meetingUsed, limit: meetingLimit, days: daysUntilReset })
      : $t('plan.quota.title', { tier: tierLabel, used: meetingUsed, limit: meetingLimit })"
  >
    <span class="dot" aria-hidden="true">📋</span>
    <span class="meeting-quota-text">
      {{ $t('plan.quota.label') }}
      <strong>{{ meetingUsed }}/{{ meetingLimit }}</strong>
      <span class="meeting-quota-remaining">
        {{ (daysUntilReset != null && daysUntilReset > 0)
          ? $t('plan.quota.remaining_reset', { remaining: meetingRemaining, days: daysUntilReset })
          : $t('plan.quota.remaining', { remaining: meetingRemaining }) }}
      </span>
    </span>
  </div>
</template>

<style scoped>
.meeting-quota-note {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px;
  border-radius: 9999px; border: 1px solid var(--border-light);
  background: var(--bg-light, #F7F5EB); color: var(--text-muted, #6F665F);
  font-size: 0.72rem; font-family: 'Pretendard', sans-serif;
  white-space: nowrap; transition: background 0.2s, color 0.2s;
}
.meeting-quota-note .dot { font-size: 0.85rem; line-height: 1; }
.meeting-quota-note strong { color: var(--text-main, #2A2421); font-variant-numeric: tabular-nums; margin: 0 2px; }
.meeting-quota-remaining { opacity: 0.7; margin-left: 2px; }
.meeting-quota-note--warning { border-color: #fbbf24; background: #fef3c7; color: #92400e; }
.meeting-quota-note--warning strong { color: #78350f; }
.meeting-quota-note--danger { border-color: #fca5a5; background: #fef2f2; color: #991b1b; font-weight: 700; }
.meeting-quota-note--danger strong { color: #7f1d1d; }
.meeting-quota-note--danger .meeting-quota-remaining { opacity: 1; }
@media (max-width: 600px) {
  .meeting-quota-note { font-size: 0.66rem; padding: 4px 9px; }
  .meeting-quota-remaining { display: none; }
}
</style>
