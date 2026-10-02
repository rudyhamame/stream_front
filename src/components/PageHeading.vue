<script setup>
defineProps({ title: String, eyebrow: { type: String, default: 'RH Library Manager' } });
</script>

<template>
  <header class="safari-compact-heading">
    <div><p class="eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1></div>
    <slot />
  </header>
</template>
