<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';

/**
 * design/ 目录的性质声明。该目录描述目标架构与规划，不是当前已实现的功能；
 * 读者从站内搜索或外链直达单篇时看不到 design/README 的说明，故逐页提示。
 */
const { page } = useData();
const isDesignDoc = computed(() => page.value.relativePath.startsWith('design/'));
</script>

<template>
  <div v-if="isDesignDoc" class="design-banner">
    <strong>前瞻设计</strong>
    本文描述目标方案，可能包含尚未实现的能力。当前已实现的功能以
    <a href="/hongyue-creation/features/workflow.html">功能说明</a> 为准。
  </div>
</template>
