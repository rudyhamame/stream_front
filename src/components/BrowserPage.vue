<script setup>
defineProps({ contained: Boolean });
</script>

<template>
  <article class="safari-page browser-page" :class="{ 'browser-page--contained': contained }"><slot /></article>
</template>
