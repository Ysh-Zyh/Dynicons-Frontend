<script setup lang="ts">
import { ref, computed } from 'vue'
import axios from 'axios'

// 开发时通过 Vite 代理避免 CORS
const API_BASE = import.meta.env.DEV ? '/api' : 'http://localhost:8889'

const emit = defineEmits<{
  (e: 'inferenceStart'): void
  (e: 'inferenceResult', data: { sankeyData?: any }): void
  (e: 'inferenceError', err: any): void
}>()

const inputValue = ref('')
const isLoading = ref(false)

const isBtnDisabled = computed(() => {
  return inputValue.value.trim().length === 0 || isLoading.value
})

const handleInference = async () => {
  if (isBtnDisabled.value) return
  isLoading.value = true
  emit('inferenceStart')
  try {
    const res = await axios.post(`${API_BASE}/semanticDivergence`, {
      input: inputValue.value,
    })
    if (res.data?.sankeyData) {
      emit('inferenceResult', { sankeyData: res.data.sankeyData })
    } else {
      emit('inferenceResult', {})
    }
  } catch (err: any) {
    emit('inferenceError', err)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="header-row">
    <h1 class="logo">Dynicons</h1>
    <div class="input-group">
      <span class="label">Input:</span>
      <input 
        v-model="inputValue" 
        type="text" 
        placeholder="Enter keywords..." 
        :disabled="isLoading"
        @keyup.enter="handleInference"
      />
      <button class="btn-inference" :class="{ 'is-loading': isLoading, 'is-disabled': isBtnDisabled }" :disabled="isBtnDisabled" @click="handleInference">
        <span v-if="!isLoading">Inference</span>
        <span v-else class="spinner"></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
}

.logo {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  color: #1a1a1a;
  letter-spacing: -0.5px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

input {
  flex: 1;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  outline: none;
}

.label {
  font-size: 14px;
  font-weight: 600;
  color: #4b5563;
}

input:disabled {
  background-color: #f3f4f6;
  cursor: not-allowed;
}

/* 按钮基础样式 */
.btn-inference {
  min-width: 100px;
  height: 32px;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #3b82f6; /* 默认蓝色 */
  color: white;
}

/* 禁用状态（灰色） */
.btn-inference:disabled,
.btn-inference.is-disabled {
  background-color: #d1d5db !important;
  color: #9ca3af;
  cursor: not-allowed;
}

/* 加载状态的旋转动画 */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-inference:hover:not(:disabled) {
  background-color: #2563eb;
}
</style>