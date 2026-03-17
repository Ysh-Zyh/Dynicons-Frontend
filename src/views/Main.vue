<script setup lang="ts">
import { ref } from 'vue'
import UserInput from '../components/UserInput.vue'
import SemanticExploration from '../components/SemanticExploration.vue'
import PromptManagement from '../components/PromptManagement.vue'
import AnimationGeneration from '../components/AnimationGeneration.vue'
import ResultGalley from '../components/ResultGalley.vue'
import { ElMessage } from 'element-plus'
import book1Url from '@/assets/images/book1.png'
import book2Url from '@/assets/images/book2.png'
import book3Url from '@/assets/images/book3.png'
import book4Url from '@/assets/images/book4.png'
import book5Url from '@/assets/images/book5.png'

const isGlobalLoading = ref(false)

// AI 返回的原始数据状态
const rawResults = ref({
  objectModifies: [],
  objects: [],
  actions: [],
  actionModifies: [],
})

// 直接存储后端返回的 sankeyData
const sankeyData = ref<{
  nodes: { name: string; type?: string }[]
  links: { source: string; target: string; value: number; description?: string }[]
} | null>(null)

// 存储当前选中的四元组路径
const selectedQuad = ref<{
  modifyL: string
  object: string
  action: string
  modify: string
} | null>(null)

// 是否已经选择过路径（首次选择使用当前面板，后续选择才新建面板）
const hasSelectedPath = ref(false)

// 组件引用
const animationGenerationRef = ref<any>(null)
const resultGalleryRef = ref<any>(null)

// 存储动画生成结果
interface AnimationResult {
  id: string
  frames: string[]
  animations: string[]
  mergedAnimation?: string
}

const animationResults = ref<AnimationResult[]>([
  {
    id: '1',
    frames: [book1Url, book2Url, book3Url, book4Url, book5Url], // 3个帧
    animations: [], // 2个动画（帧之间）
  },
])

// 接收 UserInput 的 inference 结果并更新 sankeyData
const onInferenceStart = () => {
  isGlobalLoading.value = true
}
const onInferenceResult = (data: { sankeyData?: any }) => {
  isGlobalLoading.value = false
  if (data?.sankeyData) {
    sankeyData.value = data.sankeyData
    ElMessage.success('Inference successful, the chart has been updated.')
  } else {
    ElMessage.warning('Inference successful, but the returned data is empty.')
  }
}
const onInferenceError = (err: any) => {
  isGlobalLoading.value = false
  ElMessage.error('Inference failed: ' + (err?.response?.data?.message || err?.message))
}

// 处理从 SemanticExploration 传回的路径数据：首次选择使用当前面板，后续选择才新建面板
const handlePathConfirmed = (quad: any) => {
  selectedQuad.value = quad
  if (hasSelectedPath.value) {
    const id = `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    animationResults.value.push({
      id,
      frames: [],
      animations: [],
    })
  } else {
    hasSelectedPath.value = true
  }
}

// 转发生成事件到对应组件
// Frame 1 / Frame 2 / Frame 3... 都由 ResultGalley 处理（首帧或基于选中帧+提示词生成后续帧）
// 其他 type（如动画）由 AnimationGeneration 处理
const handleGenerate = async (data: any) => {
  isGlobalLoading.value = true
  try {
    const isFrameType = typeof data.type === 'string' && /^Frame \d+$/.test(data.type)
    if (isFrameType) {
      await resultGalleryRef.value?.handleGenerate?.(data)
    } else {
      await animationGenerationRef.value?.handleGenerate?.(data)
    }
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'Generation failed'
    ElMessage.error(msg)
    console.error('Generate error:', err)
  } finally {
    isGlobalLoading.value = false
  }
}

</script>

<template>
  <div class="workspace-layout">
    <div v-if="isGlobalLoading" class="global-mask">
      <div class="loading-content">
        <div class="main-spinner"></div>
        <p>Loading...</p>
      </div>
    </div>
    <aside class="column-left">
      <UserInput
        @inference-start="onInferenceStart"
        @inference-result="onInferenceResult"
        @inference-error="onInferenceError"
      />

      <div class="left-panels">
        <div class="box semantic">
          <h3>Semantic Exploration</h3>
          <div class="component-wrapper">
            <SemanticExploration
              :raw-results="rawResults"
              :sankey-data="sankeyData"
              @pathConfirmed="handlePathConfirmed"
            />
          </div>
        </div>
        <div class="box prompt">
          <h3>Prompt Management</h3>
          <PromptManagement :selected-quad="selectedQuad" @generate="handleGenerate" />
        </div>
      </div>
    </aside>

    <main class="column-right">
      <div class="box animation">
        <h3>Animation Generation</h3>
        <AnimationGeneration
          ref="animationGenerationRef"
        />
      </div>
      <div class="box results">
        <ResultGalley
          ref="resultGalleryRef"
          v-model:animation-results="animationResults"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.workspace-layout {
  display: grid;
  grid-template-columns: 1fr 2fr; /* 左右比例 1:2 */
  gap: 10px;
  height: 100vh;
  padding: 6px;
  box-sizing: border-box;
  background-color: #f8f9fa;
}

/* --- 左侧纵列布局 --- */
.column-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px; /* 固定输入栏高度 */
  flex-shrink: 0;
}

.left-panels {
  flex: 1;
  display: grid;
  grid-template-rows: 6fr 4fr; /* 确保这里是比例，且总和撑满父级 */
  gap: 6px;
  overflow: hidden; /* 关键：防止内部元素把 grid 撑开 */
}

.box.semantic {
  overflow: hidden; /* 关键 */
  display: flex;
  flex-direction: column;
}

.box.prompt {
  overflow: hidden; /* 关键 */
  display: flex;
  flex-direction: column;
}

.box.animation {
  overflow: hidden; /* 关键 */
  display: flex;
  flex-direction: column;
}

.box.results {
  overflow: hidden; /* 关键 */
  display: flex;
  flex-direction: column;
}

/* --- 右侧纵列布局 --- */
.column-right {
  display: grid;
  grid-template-rows: 4.5fr 5.2fr; /* 右侧 5:5 */
  gap: 6px;
  overflow: hidden; /* 关键：防止内部元素把 grid 撑开 */
}

/* --- 通用样式 --- */
.box {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 关键：允许 flex 子元素在必要时收缩 */
}

.logo {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.input-group input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.btn-inference {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}

h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #333;
}

.global-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(4px); /* 高级感的模糊效果 */
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-content {
  text-align: center;
}

.main-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.component-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.box.prompt {
  background-color: #ffffff;
}

/* --- Result Gallery 样式 --- */
.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.gallery-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.result-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
}

.result-tab {
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.result-tab:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.result-tab.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.2);
}

.results-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 16px;
  transition: all 0.2s ease;
  flex-wrap: nowrap;
  overflow-x: auto;
  min-width: 100%;
}

.result-row:hover {
  background: #f3f4f6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 150px;
}

.result-label {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  text-align: center;
}

.result-placeholder {
  width: 150px;
  height: 150px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.animation-placeholder {
  width: 200px;
  height: 150px;
  aspect-ratio: 16/9;
}

.result-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.empty-result {
  color: #9ca3af;
  font-size: 12px;
  text-align: center;
  padding: 10px;
}

.merge-btn-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
}

.merge-btn {
  padding: 10px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.merge-btn:hover {
  background: #2563eb;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.final-result {
  min-width: 200px;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .result-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .result-item {
    min-width: unset;
  }

  .result-placeholder {
    width: 100%;
    max-width: 300px;
    margin: 0 auto;
  }

  .animation-placeholder {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }

  .merge-btn-container {
    align-items: center;
    padding-bottom: 0;
    justify-content: center;
  }
}
</style>
