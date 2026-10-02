<script setup>
import { computed } from 'vue';
const props = defineProps({
  item: { type: Object, required: true },
  variant: { type: String, default: 'home' },
  imageSrc: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  kindLabel: { type: String, default: '' },
  open: Boolean, saved: Boolean, focused: Boolean,
});
const emit = defineEmits(['toggle', 'play', 'save', 'image-error', 'focus', 'hover']);
const browse = computed(() => props.variant === 'browse');
const cardClass = computed(() => ({ home: 'home-content-card', playlist: 'playlist-card', browse: 'browse-poster' })[props.variant]);
const artClass = computed(() => ({ home: 'home-card-art', playlist: 'playlist-card-art', browse: 'browse-poster-art' })[props.variant]);
const saveLabel = computed(() => props.saved ? 'Remove from library' : 'Add to library');
function activate() { emit(browse.value ? 'play' : 'toggle'); }
</script>

<template>
  <component :is="browse ? 'button' : 'div'" :type="browse ? 'button' : undefined"
    class="media-card" :class="[cardClass, { 'is-open': open, enabled: saved && variant === 'playlist', focused }]"
    :role="browse ? undefined : 'group'" :tabindex="browse ? undefined : 0" :aria-label="item.title"
    @click="activate" @keydown.enter.self.prevent="!browse && activate()" @keydown.space.self.prevent="!browse && activate()"
    @focus="emit('focus', $event)" @mouseenter="emit('hover', $event)">
    <span :class="artClass">
      <img v-if="imageSrc" :src="imageSrc" :alt="item.title" loading="lazy" @error="emit('image-error')">
      <span v-else class="media-card-fallback" :data-kind="item.kind">
        <span class="fallback-mark">RH</span><span class="fallback-name">{{ item.title }}</span><span class="fallback-kind">{{ kindLabel }}</span>
      </span>
      <transition v-if="!browse" name="card-fade">
        <span v-if="open" class="card-actions">
          <button type="button" class="card-action-btn" aria-label="Play" title="Play" @click.stop="emit('play')"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></button>
          <button type="button" class="card-action-btn" :class="{ on: saved }" :aria-label="saveLabel" :title="saveLabel" @click.stop="emit('save')"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="saved ? 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' : 'M11 5v6H5v2h6v6h2v-6h6v-2h-6V5z'" /></svg></button>
        </span>
      </transition>
    </span>
    <span v-if="variant === 'playlist'" class="playlist-card-copy"><strong>{{ item.title }}</strong><small>{{ subtitle }}</small></span>
    <template v-else><strong>{{ item.title }}</strong><small>{{ subtitle }}</small></template>
  </component>
</template>
