<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

export interface AnimationResult {
  id: string
  frames: string[]
  animations: string[]
  mergedAnimation?: string
}

// 开发时通过 Vite 代理避免 CORS，生产环境需配置实际后端地址
const API_BASE = import.meta.env.DEV ? '/api' : 'http://localhost:8889'
// 静态资源（如 /static/gifs/xxx）需用后端完整地址，否则 img 无法加载
const BACKEND_ORIGIN = import.meta.env.DEV ? 'http://localhost:8889' : ''

const props = defineProps<{
  animationResults: AnimationResult[]
}>()

const emit = defineEmits<{
  (e: 'update:animationResults', value: AnimationResult[]): void
}>()

const results = computed<AnimationResult[]>(() =>
  props.animationResults.length > 0 ? props.animationResults : [],
)
const activeResultIndex = ref(0)

// 悬停在序列区域时，使用鼠标滚轮控制横向滚动
const handleFilmStripWheel = (event: WheelEvent) => {
  const container = event.currentTarget as HTMLElement | null
  if (!container) return
  const speed = 0.8 // 调整滚动速度
  container.scrollLeft += event.deltaY * speed
}

// 悬停高亮：动画帧与其左右图片帧的联动
const hoveredAnimGroup = ref<{ resultIndex: number; animIndex: number } | null>(null)

const handleAnimHoverEnter = (resultIndex: number, animIndex: number) => {
  hoveredAnimGroup.value = { resultIndex, animIndex }
}

const handleAnimHoverLeave = () => {
  hoveredAnimGroup.value = null
}

// 选中状态管理
const selectedFrame = ref<{ resultIndex: number; frameIndex: number } | null>(null)

// 拖拽开始事件
const handleDragStart = (event: DragEvent, imageUrl: string) => {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', imageUrl)
  }
}

// 禁止拖拽（用于动画/合并结果）
const blockDragStart = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.clearData()
}

// 处理帧点击事件
const handleFrameClick = (resultIndex: number, frameIndex: number) => {
  // 如果点击的是已选中的帧，则取消选中
  if (
    selectedFrame.value?.resultIndex === resultIndex &&
    selectedFrame.value?.frameIndex === frameIndex
  ) {
    selectedFrame.value = null
  } else {
    // 否则选中新的帧
    selectedFrame.value = { resultIndex, frameIndex }
  }
}

// 切换到指定的生成结果
const switchToResult = (index: number) => {
  activeResultIndex.value = index
  // 切换结果时重置选中状态
  selectedFrame.value = null
}

// 合并动画：调用后端 GET /mergeAnimation，触发后端拼接并返回结果，展示在 Merged Result
const mergeLoading = ref(false)
async function mergeAnimation() {
  mergeLoading.value = true
  try {
    const res = await axios.get(`${API_BASE}/mergeAnimation`, {
      timeout: 60 * 1000,
    })
    const data = res.data || {}
    const mergedUrl = data.gif_url ?? data.merged_url ?? data.url ?? data.mergedAnimation
    if (!mergedUrl) {
      ElMessage.warning(data?.message ?? 'Merge succeeded but no URL returned')
      return
    }
    const displayUrl = typeof mergedUrl === 'string' && mergedUrl.startsWith('/')
      ? `${BACKEND_ORIGIN}${mergedUrl}`
      : mergedUrl
    const list = props.animationResults.map((r, i) =>
      i === activeResultIndex.value ? { ...r, mergedAnimation: displayUrl } : r
    )
    emit('update:animationResults', list)
    ElMessage.success('Merge completed')
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? err?.message ?? 'Merge failed'
    ElMessage.error(msg)
  } finally {
    mergeLoading.value = false
  }
}

// 关闭当前结果面板（内部更新列表并 emit）
const closeResult = (id: string, index: number) => {
  const list = props.animationResults.filter((r) => r.id !== id)
  emit('update:animationResults', list)
  if (activeResultIndex.value === index && activeResultIndex.value > 0) {
    activeResultIndex.value -= 1
  } else if (activeResultIndex.value > index) {
    activeResultIndex.value -= 1
  }
  if (list.length <= 1) {
    activeResultIndex.value = 0
  }
}

// 调用后端 /generatedAnimation 获取已生成的动画列表，并填充到当前结果的 animation 槽位
// 约定：后端按“最新在前”排序；动画槽位按“生成顺序”：第 1 个动画框 = 第 1 段生成结果，第 2 个 = 第 2 段，以此类推，直接覆盖该位置，不整体后移
async function fetchGeneratedAnimations() {
  try {
    const res = await axios.get(`${API_BASE}/generatedAnimation`, { timeout: 10000 })
    const raw = res.data
    const list: string[] = Array.isArray(raw) ? raw : (raw?.animations ?? [])
    const fullUrls = list.map((path: string) =>
      path.startsWith('/') ? `${BACKEND_ORIGIN}${path}` : path
    )
    if (fullUrls.length === 0) return
    const result = props.animationResults[activeResultIndex.value]
    if (!result?.frames?.length) return
    const slotCount = result.frames.length - 1
    if (slotCount <= 0) return
    // 后端 newest first，故取“最后 N 个”为按生成顺序的第 1～N 段，对应 Animation 1～N，直接覆盖各槽位
    const chronoOrder = fullUrls.slice(-slotCount).reverse()
    const animations = [...(result.animations || [])]
    for (let i = 0; i < slotCount; i++) {
      animations[i] = chronoOrder[i] ?? ''
    }
    const list_ = props.animationResults.map((r, i) =>
      i === activeResultIndex.value ? { ...r, animations } : r
    )
    emit('update:animationResults', list_)
  } catch (err) {
    console.warn('Fetch generated animations failed:', err)
  }
}

onMounted(() => {
  fetchGeneratedAnimations()
})

// 删除指定槽位的动画：调用后端 DELETE /deleteAnimation，成功后从当前结果中移除该动画
async function deleteAnimation(resultIndex: number, frameIndex: number) {
  const result = props.animationResults[resultIndex]
  const url = result?.animations?.[frameIndex]
  if (!url || typeof url !== 'string') return
  try {
    await axios.delete(`${API_BASE}/deleteAnimation`, {
      data: { url },
      headers: { 'Content-Type': 'application/json' },
    })
    const list = props.animationResults.map((r, i) => {
      if (i !== resultIndex) return r
      const animations = [...(r.animations || [])]
      animations[frameIndex] = ''
      return { ...r, animations }
    })
    emit('update:animationResults', list)
    ElMessage.success('Animation deleted')
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'Delete failed'
    ElMessage.error(msg)
  }
}

// 确保图片为 data URL 格式（后端需要 base64）
async function ensureDataUrl(input: string): Promise<string> {
  if (typeof input === 'string' && input.startsWith('data:')) return input
  if (typeof input === 'string') {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
  throw new Error('Invalid image input')
}

// 生成 Frame 1：调用 /firstFrame 并更新当前序列的 frames[0]
async function handleGenerateFrame1(prompt: string) {
  const res = await axios.post(
    `${API_BASE}/firstFrame`,
    { prompt },
    { headers: { 'Content-Type': 'application/json' }, timeout: 5 * 60 * 1000 },
  )
  if (!res.data?.ok || !res.data?.image_url) {
    throw new Error(res.data?.error || 'Frame generation failed')
  }
  const imageUrl = res.data.image_url
  let list: AnimationResult[]
  if (props.animationResults.length === 0) {
    list = [
      {
        id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        frames: [imageUrl],
        animations: [],
      },
    ]
  } else {
    const lastIndex = props.animationResults.length - 1
    list = props.animationResults.map((r, i) => {
      if (i !== lastIndex) return r
      const frames = r.frames || []
      return {
        ...r,
        frames: [imageUrl, ...frames.slice(1)],
      }
    })
  }
  emit('update:animationResults', list)
  ElMessage.success('Frame 1 generated successfully')
}

// 生成其他关键帧（Frame 2+）：调用 /otherFrame，需要初始帧图片 + 提示词
async function handleGenerateOtherFrame(prompt: string) {
  if (!selectedFrame.value) {
    ElMessage.warning('Please click on an initial frame image first')
    return
  }
  const { resultIndex, frameIndex } = selectedFrame.value
  const result = props.animationResults[resultIndex]
  if (!result?.frames?.[frameIndex]) {
    ElMessage.warning('Selected frame has no image')
    return
  }
  const frameImageUrl = result.frames[frameIndex]
  const imageDataUrl = await ensureDataUrl(frameImageUrl)
  const res = await axios.post(
    `${API_BASE}/otherFrame`,
    { prompt, image: imageDataUrl },
    { headers: { 'Content-Type': 'application/json' }, timeout: 5 * 60 * 1000 },
  )
  if (!res.data?.ok || !res.data?.image_url) {
    throw new Error(res.data?.error || 'Other frame generation failed')
  }
  const newImageUrl = res.data.image_url
  const insertIndex = frameIndex + 1
  const list = props.animationResults.map((r, i) => {
    if (i !== resultIndex) return r
    const frames = [...(r.frames || [])]
    const animations = [...(r.animations || [])]
    // 在选中帧之后插入新帧
    if (insertIndex >= frames.length) {
      frames.push(newImageUrl)
      if (frames.length >= 2) animations.push('') // 新帧与前一帧之间需动画占位
    } else {
      frames.splice(insertIndex, 0, newImageUrl)
      // 插入新帧后，animations[i] 对应 frame[i]->frame[i+1]，需在 insertIndex 处插入空占位
      animations.splice(insertIndex, 0, '')
      animations[insertIndex - 1] = '' // 原选中帧到下一帧的动画需清空（现已变为选中帧->新帧）
    }
    return { ...r, frames, animations }
  })
  emit('update:animationResults', list)
  ElMessage.success('Frame generated successfully')
}

// 统一生成入口
async function handleGenerate(data: { prompt?: string; type: string }) {
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : ''
  if (!prompt) {
    ElMessage.warning('Please select a prompt with content first')
    return
  }
  if (data.type === 'Frame 1') {
    await handleGenerateFrame1(prompt)
  } else if (/^Frame \d+$/.test(data.type)) {
    // Frame 2, Frame 3, ...
    await handleGenerateOtherFrame(prompt)
  }
  // 其他 type（如动画）由 AnimationGeneration 处理
}

defineExpose({ handleGenerate, fetchGeneratedAnimations })
</script>

<template>
  <div class="result-gallery">
    <!-- 顶部标题和切换标签 -->
    <div class="gallery-header">
      <h3>Result Gallery</h3>
      <div class="header-actions">
        <button type="button" class="refresh-anim-btn" @click="fetchGeneratedAnimations" title="Refresh animations from backend">
          Refresh Animations
        </button>
        <div class="result-tabs">
        <button
          v-for="(result, index) in results"
          :key="result.id"
          class="result-tab"
          :class="{ active: index === activeResultIndex }"
          @click="switchToResult(index)"
        >
          <span class="tab-label">Result {{ index + 1 }}</span>
          <span class="tab-close" @click.stop="closeResult(result.id, index)">×</span>
        </button>
        </div>
      </div>
    </div>

    <!-- 结果展示区域 -->
    <div class="results-container">
      <div
        v-for="(result, resultIndex) in results"
        :key="result.id"
        class="result-row"
        v-show="resultIndex === activeResultIndex"
      >
        <!-- 左边的可滚动部分 -->
        <div class="result-scrollable">
          <div
            class="film-strip"
            @wheel.prevent="handleFilmStripWheel"
          >
            <!-- 上排：Frames -->
            <template
              v-for="(frame, frameIndex) in result.frames"
              :key="`frame-${result.id}-${frameIndex}`"
            >
              <div class="film-cell frame-cell" :style="{ gridColumn: String(frameIndex * 2 + 1) }">
                <div class="result-item">
                  <div class="result-label">Frame {{ frameIndex + 1 }}</div>
                  <div
                    class="result-placeholder"
                    :class="{
                      selected:
                        selectedFrame?.resultIndex === resultIndex &&
                        selectedFrame?.frameIndex === frameIndex,
                      'linked-to-animation':
                        hoveredAnimGroup?.resultIndex === resultIndex &&
                        (hoveredAnimGroup?.animIndex === frameIndex ||
                          hoveredAnimGroup?.animIndex + 1 === frameIndex),
                    }"
                    @click="handleFrameClick(resultIndex, frameIndex)"
                  >
                    <div class="image-container">
                      <img
                        v-if="frame"
                        :src="frame"
                        class="result-img"
                        draggable="true"
                        @dragstart="(e) => handleDragStart(e, frame)"
                      />
                      <div v-else class="empty-result">No frame</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 中间：Animation（放在两帧之间） -->
              <div
                v-if="frameIndex < result.frames.length - 1"
                class="film-cell anim-cell"
              >
                <div class="result-item">
                  <!-- 帧与动画之间的连线与箭头 -->
                  <div
                    class="anim-connector"
                    :class="{
                      'anim-connector-linked':
                        hoveredAnimGroup?.resultIndex === resultIndex &&
                        hoveredAnimGroup?.animIndex === frameIndex,
                    }"
                  >
                    <div class="anim-connector-line"></div>
                  </div>
                  <div class="result-label anim-label">Animation {{ frameIndex + 1 }}</div>
                  <!-- 动画时间条 -->
                  <div class="anim-timeline">
                    <div class="anim-timeline-track">
                      <div class="anim-timeline-fill"></div>
                    </div>
                    <div class="anim-timeline-label">1.0s</div>
                  </div>
                  <div
                    class="result-placeholder animation-placeholder anim-with-delete"
                    :class="{
                      'linked-animation':
                        hoveredAnimGroup?.resultIndex === resultIndex &&
                        hoveredAnimGroup?.animIndex === frameIndex,
                    }"
                    @mouseenter="handleAnimHoverEnter(resultIndex, frameIndex)"
                    @mouseleave="handleAnimHoverLeave"
                  >
                    <div class="image-container">
                      <img
                        v-if="result.animations[frameIndex]"
                        :src="result.animations[frameIndex]"
                        class="result-img"
                        draggable="false"
                        @dragstart="blockDragStart"
                      />
                      <div v-else class="empty-result">No animation</div>
                    </div>
                    <div
                      v-if="result.animations[frameIndex]"
                      class="anim-delete-hotzone"
                      title="Delete this animation"
                    >
                      <button
                        type="button"
                        class="anim-delete-btn"
                        @click.stop="deleteAnimation(resultIndex, frameIndex)"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>

          </div>
        </div>

        <!-- 分隔线 -->
        <div class="divider"></div>

        <!-- 右边的固定部分 -->
        <div class="result-fixed">
          <!-- 合并按钮 -->
          <div class="merge-btn-container">
            <button
            class="merge-btn"
            :disabled="mergeLoading"
            @click="mergeAnimation()"
          >
            {{ mergeLoading ? 'Merging...' : 'Merge' }}
          </button>
          </div>

          <!-- 最终合并结果 -->
          <div class="result-item final-result">
            <div class="result-label anim-label">Merged Result</div>
            <!-- 合并结果时间条（与前面的动画结果样式一致） -->
            <div class="anim-timeline">
              <div class="anim-timeline-track">
                <div class="anim-timeline-fill"></div>
              </div>
              <div class="anim-timeline-label">1.0s</div>
            </div>
            <div class="result-placeholder animation-placeholder merged-animation-placeholder">
              <div class="image-container">
                <img
                  v-if="result.mergedAnimation"
                  :src="result.mergedAnimation"
                  class="result-img"
                  draggable="false"
                  @dragstart="blockDragStart"
                />
                <div v-else class="empty-result">No merged animation</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-gallery {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 顶部标题和切换标签 */
.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  width: 100%;
}

.gallery-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-anim-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  color: #3b82f6;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
}
.refresh-anim-btn:hover {
  background: #dbeafe;
}

/* 顶部切换按钮 */
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
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  border-bottom: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.tab-close {
  font-weight: 700;
  cursor: pointer;
  padding: 0 2px;
}

.tab-close:hover {
  color: #ef4444;
}

/* 结果展示区域 */
.results-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border-top: 1px solid #e5e7eb;
  border-radius: 0 0 8px 8px;
  padding-top: 16px;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 0px;
  padding: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 16px;
  transition: all 0.2s ease;
  flex-wrap: nowrap;
  min-width: 100%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* 左边的可滚动部分：自身不滚动，只作为容器 */
.result-scrollable {
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

/* 胶片卷轴：上排 Frames，下排 Animations */
.film-strip {
  --card: 180px; /* 卡片尺寸 */
  --gap: 24px; /* 间距 */

  display: flex;
  align-items: center;
  gap: var(--gap);
  padding: 2px;
  flex-wrap: nowrap;
  overflow-x: auto;
}

/* 隐藏横向滚动条（仍然允许程序控制 scrollLeft） */
.film-strip {
  scrollbar-width: none; /* Firefox */
}

.film-strip::-webkit-scrollbar {
  display: none; /* Chrome / Edge / Safari */
}

.film-cell {
  flex-shrink: 0;
  min-width: var(--card);
  width: var(--card);
}

.frame-cell {
  position: relative;
}

.anim-cell {
  position: relative;
  margin-top: 0;
}

/* 分隔线 */
.divider {
  width: 1px;
  height: 180px;
  background: transparent;
  border-left: 1px dashed #d1d5db;
  margin: 0 20px;
}

/* 右边的固定部分 */
.result-fixed {
  display: flex;
  align-items: center;
  gap: 0px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

.result-row:hover {
  background: #f3f4f6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 结果项 */
.result-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 150px;
}

.result-label {
  font-size: 14px;
  font-weight: 600;
  color: #4b5563;
  text-align: center;
  margin-bottom: 8px;
}

.result-placeholder {
  width: 180px;
  height: 180px;
  background: #ffffff; /* 实体感卡片背景 */
  border: 1px solid #e5e7eb; /* 浅灰实线边框 */
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08); /* 轻微浮起阴影 */
  transition: all 0.2s ease;
}

/* 选中状态样式 */
.result-placeholder.selected {
  border: 2px solid #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  background: rgba(59, 130, 246, 0.05);
}

/* 悬停联动：与动画相连的图片帧 */
.result-placeholder.linked-to-animation {
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.35);
}

/* 动画帧：胶片风格卡片（浅色渐变） */
.animation-placeholder {
  width: 180px;
  height: 180px;
  background: linear-gradient(135deg, #e0f2fe, #eef2ff);
  border: 2px solid #bfdbfe;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 3px 6px rgba(148, 163, 184, 0.35);
  position: relative;
}

/* 悬停联动：动画本身高亮 */
.linked-animation {
  border-color: #2563eb;
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.4);
  transform: translateY(-2px);
}

/* 帧与动画之间的连线和箭头 */
.anim-connector {
  position: relative;
  height: 14px;
  margin-bottom: 2px;
}

.anim-connector-line {
  position: absolute;
  top: 50%;
  left: -14px;  /* 略微向左右延伸，视觉上连接到两侧帧 */
  right: -14px;
  height: 2px;
  background: linear-gradient(90deg, #bfdbfe, #60a5fa);
  border-radius: 999px;
}

.anim-connector-line::before,
.anim-connector-line::after {
  content: '';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  border-style: solid;
}

/* 左箭头：指向动画的起始帧 */
.anim-connector-line::before {
  left: 0;
  border-width: 4px 6px 4px 0;
  border-color: transparent #60a5fa transparent transparent;
}

/* 右箭头：指向动画的终止帧 */
.anim-connector-line::after {
  right: 0;
  border-width: 4px 0 4px 6px;
  border-color: transparent transparent transparent #60a5fa;
}

/* 悬停当前动画组时，连线也一起高亮 */
.anim-connector-linked .anim-connector-line {
  height: 3px;
  background: linear-gradient(90deg, #60a5fa, #2563eb);
}

/* 胶片左右打孔效果 */
.anim-cell .animation-placeholder::before,
.anim-cell .animation-placeholder::after {
  content: "";
  position: absolute;
  top: 10px;
  bottom: 10px;
  width: 10px;
  background-image: radial-gradient(circle, #e5e7eb 2px, transparent 3px);
  background-size: 10px 16px;
  background-repeat: repeat-y;
  opacity: 0.9;
}

.anim-cell .animation-placeholder::before {
  left: 0;
}

.anim-cell .animation-placeholder::after {
  right: 0;
}

.anim-with-delete {
  position: relative;
}

/* 动画 label 颜色强化 */
.anim-label {
  color: #1d4ed8;
}

/* 动画时间条样式 */
.anim-timeline {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -4px 0 4px;
}

.anim-timeline-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.anim-timeline-fill {
  width: 70%; /* 默认填充比例，可后续按真实时长调节 */
  height: 100%;
  background: linear-gradient(90deg, #60a5fa, #2563eb);
}

/* 合并结果时间条可单独调整颜色或长度 */
.anim-timeline-fill-merged {
  width: 100%;
  background: linear-gradient(90deg, #34d399, #059669);
}

.anim-timeline-label {
  font-size: 11px;
  color: #4b5563;
  white-space: nowrap;
}

/* 右上角热区：仅鼠标移入此处时显示删除按钮 */
.anim-delete-hotzone {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 4px;
  cursor: default;
}

.anim-delete-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease, color 0.2s, background 0.2s, border-color 0.2s;
}

.anim-delete-hotzone:hover .anim-delete-btn {
  opacity: 1;
}

.anim-delete-btn:hover {
  color: #ef4444;
  background: #fef2f2;
  border-color: #fecaca;
}

/* 影子占位符（新帧提示） */
.shadow-placeholder .result-placeholder {
  background: #f9fafb;
  border-style: dashed;
  border-color: #d1d5db;
  box-shadow: none;
}

/* 图片容器 - 用于悬停放大效果 */
.image-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 图片样式 */
.result-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: default;
  transition: transform 0.3s ease;
}

.result-img:active {
  cursor: grabbing;
}

/* 悬停放大效果 */
.image-container:hover .result-img {
  transform: scale(1.2);
  z-index: 100;
}

/* 确保放大时不会被容器裁剪 */
.image-container {
  z-index: 1;
}

.image-container:hover {
  z-index: 100;
}

.empty-result {
  color: #9ca3af;
  font-size: 12px;
  text-align: center;
  padding: 10px;
}

/* 合并按钮 */
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

.merge-btn:hover:not(:disabled) {
  background: #2563eb;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.merge-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 最终结果 */
.final-result {
  min-width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .result-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .result-scrollable {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    overflow-x: visible;
  }

  .animation-container {
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin: 12px 0;
  }

  .arrow {
    width: 1px;
    height: 20px;
    border-top: none;
    border-left: 1px dashed #d1d5db;
  }

  .arrow::after {
    border-style: dashed;
    border-color: #d1d5db;
  }

  .arrow-left::after {
    right: -4px;
    top: auto;
    bottom: 0;
    border-width: 0 5px 8px 5px;
    border-color: transparent transparent #d1d5db transparent;
  }

  .arrow-right::after {
    left: -4px;
    top: 0;
    bottom: auto;
    border-width: 8px 5px 0 5px;
    border-color: #d1d5db transparent transparent transparent;
  }

  .divider {
    width: 100%;
    height: 1px;
    border-left: none;
    border-top: 1px dashed #d1d5db;
    margin: 12px 0;
  }

  .result-fixed {
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

  .final-result {
    align-items: center;
    justify-content: center;
  }
}
</style>
