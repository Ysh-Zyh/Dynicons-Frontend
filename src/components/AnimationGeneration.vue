<script setup lang="ts">
import { ref, reactive } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import TrajectoryEditor from './TrajectoryEditor.vue'

const emit = defineEmits<{
  (e: 'animation-generated', data: { img1: string; img2: string; gif: string }): void
}>()

const loading = reactive({
  gif: false,
})

const form = reactive({
  img1: '',
  img2: '',
  gif: '',
  controlScale: 1.0,
  motionBucket: 50,
  fps: 7,
  frameCount: 14,
  duration: 110,
})

// 轨迹点：与 TrajectoryEditor/trajectory.ts 中的 Tracks 类型保持一致
const trackingPoints = ref<number[][][]>([])
const trajEditor = ref<InstanceType<typeof TrajectoryEditor> | null>(null)

// 处理拖放事件 - 初始帧
const handleDropInitial = (event: DragEvent) => {
  event.preventDefault()
  const imageUrl = event.dataTransfer?.getData('text/plain')
  if (imageUrl) {
    form.img1 = imageUrl
    ElMessage.success('Initial frame updated successfully!')
  }
}

// 处理拖放事件 - 终止帧
const handleDropFinal = (event: DragEvent) => {
  event.preventDefault()
  const imageUrl = event.dataTransfer?.getData('text/plain')
  if (imageUrl) {
    form.img2 = imageUrl
    ElMessage.success('Final frame updated successfully!')
  }
}

// 处理拖拽经过事件
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

// 将图片 URL 转换为 Base64 格式
const urlToDataURL = async (input: string | File | Blob): Promise<string> => {
  // 已经是 dataURL
  if (typeof input === 'string' && input.startsWith('data:')) return input

  // 传入的是 File / Blob
  if (input instanceof File || input instanceof Blob) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(input)
    })
  }

  // 传入的是字符串（可能是 blob: 或 http(s):）
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

  throw new Error('Unsupported input for urlToDataURL')
}

// 生成动画
const generateAnimation = async () => {
  // 检查是否已经选择了两张图片
  if (!form.img1 || !form.img2) {
    ElMessage.error('Please select both initial and final frames!')
    return
  }

  loading.gif = true
  try {
    // 将图片转换为 Base64 格式
    const [startImg, endImg] = await Promise.all([
      urlToDataURL(form.img1),
      urlToDataURL(form.img2)
    ])

    // 调用后端 API 生成动画
    const response = await axios.post(
      'http://localhost:9999/animation',
      {
        startImg,
        endImg,
        controlScale: form.controlScale,
        motionBucket: form.motionBucket,
        trackingPoints: trackingPoints.value,
        frameCount: form.frameCount,
        fps: form.fps,
        duration: form.duration,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10 * 60 * 1000 },
    )

    if (response.data && (response.data.combined_url || response.data.final_url)) {
      form.gif = response.data.combined_url || response.data.final_url
      ElMessage.success('Animation generated successfully!')
      // 通知父组件动画已生成
      emit('animation-generated', {
        img1: form.img1,
        img2: form.img2,
        gif: form.gif,
      })
    } else {
      ElMessage.error('Animation generation failed. No animation URL was retrieved.')
    }
  } catch (err) {
    console.error('Animation generation error:', err)
    const errorMessage = err && typeof err === 'object' && 'response' in err
      ? (err as any).response?.data?.error || (err as any).message
      : 'Animation generation failed'
    ElMessage.error(errorMessage)
  } finally {
    loading.gif = false
  }
}

// 控制按钮点击事件
const handleControlButtonClick = (buttonName: string) => {
  console.log(`${buttonName} clicked`)
  ElMessage.info(`${buttonName} functionality to be implemented`)
}

// 轨迹编辑器相关方法
const addDragTrajectory = () => {
  trajEditor.value?.addDragTrajectory()
}

const reset = () => {
  trajEditor.value?.reset()
}

const deleteLastDrag = () => {
  trajEditor.value?.deleteLastDrag()
}

const deleteLastStep = () => {
  trajEditor.value?.deleteLastStep()
}

// 处理轨迹更新
const handleTrackingPointsUpdate = (points: number[][]) => {
  trackingPoints.value = points
}
</script>

<template>
  <div class="animation-gen-container">
    <div class="main-content">
      <!-- 左侧：图片帧输入 -->
      <div class="left-section">
        <div class="frame-container">
          <div class="frame-label">Initial Frame</div>
          <div class="image-placeholder" @drop="handleDropInitial" @dragover="handleDragOver">
            <TrajectoryEditor
              v-if="form.img1"
              ref="trajEditor"
              v-model:value="trackingPoints"
              :imgUrl="form.img1"
              :width="400"
              :height="400"
              :interactive="true"
              :showToolbar="false"
            />
            <div v-else class="empty-text">
              <div>Initial Frame</div>
            </div>
          </div>
        </div>

        <div class="frame-container">
          <div class="frame-label">Final Frame</div>
          <div class="image-placeholder" @drop="handleDropFinal" @dragover="handleDragOver">
            <TrajectoryEditor
              v-if="form.img2"
              v-model:value="trackingPoints"
              :imgUrl="form.img2"
              :width="400"
              :height="400"
              :interactive="true"
              :showToolbar="false"
            />
            <div v-else class="empty-text">
              <div>Final Frame</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间：控制区域 -->
      <div class="control-section">
        <div class="control-title">Animation Parameter Control</div>
        <div class="control-buttons">
          <button class="control-btn" :disabled="!form.img1" @click="addDragTrajectory">
            Add New Trajectory
          </button>
          <button class="control-btn" :disabled="!form.img1" @click="reset">Reset</button>
          <button class="control-btn" :disabled="!form.img1" @click="deleteLastStep">
            Delete Last Step
          </button>
          <button class="control-btn" :disabled="!form.img1" @click="deleteLastDrag">
            Delete Last Drag
          </button>
        </div>
        <div class="control-sliders">
          <div class="slider-item">
            <span class="slider-label">Control Scale</span>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              v-model.number="form.controlScale"
              class="slider"
            />
            <span class="slider-value">{{ form.controlScale.toFixed(1) }}</span>
          </div>
          <div class="slider-item">
            <span class="slider-label">Motion Bucket</span>
            <input
              type="range"
              min="1"
              max="180"
              step="1"
              v-model.number="form.motionBucket"
              class="slider"
            />
            <span class="slider-value">{{ form.motionBucket }}</span>
          </div>
          <div class="slider-item">
            <span class="slider-label">Frame Rate (FPS)</span>
            <input
              type="range"
              min="1"
              max="60"
              step="1"
              v-model.number="form.fps"
              class="slider"
            />
            <span class="slider-value">{{ form.fps }}</span>
          </div>
          <div class="slider-item">
            <span class="slider-label">Frame Count</span>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              v-model.number="form.frameCount"
              class="slider"
            />
            <span class="slider-value">{{ form.frameCount }}</span>
          </div>
           <div class="slider-item">
            <span class="slider-label">Duration</span>
            <input
              type="range"
              min="1"
              max="200"
              step="1"
              v-model.number="form.duration"
              class="slider"
            />
            <span class="slider-value">{{ form.duration }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧：动画结果 -->
      <div class="right-section">
        <div class="result-container">
          <div class="result-label">Animation Result</div>
          <div class="result-placeholder">
            <div v-if="loading.gif" class="loading-state">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>Generating Animation...</span>
            </div>
            <img v-else-if="form.gif" :src="form.gif" class="result-img" />
            <div v-else class="empty-result">No animation generated yet</div>
          </div>
          <div class="generate-btn-container">
            <button
              class="generate-btn"
              :disabled="loading.gif || !form.img1 || !form.img2"
              @click="generateAnimation"
            >
              {{ loading.gif ? 'Generating...' : 'Generate' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animation-gen-container {
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 1.2fr 2fr;
  gap: 10px;
  height: 100%;
  align-items: start;
}
.left-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.frame-container {
  display: flex;
  flex-direction: column;
}

.frame-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 8px;
}

/* 轨迹编辑器按钮 */
.traj-buttons {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.traj-buttons .control-btn {
  flex: 1;
  min-width: 80px;
}

.image-placeholder {
  width: 100%;
  height: 232px;
  aspect-ratio: 1;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: default;
  transition: all 0.2s ease;
}

.image-placeholder:hover {
  border-color: #3b82f6;
  background: #f0f7ff;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.empty-text {
  color: #9ca3af;
  font-size: 0.8rem;
  text-align: center;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hint {
  font-size: 0.7rem;
  margin-top: 5px;
}

/* 中间：控制区域 */
.control-section {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 5px;
}

.control-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 5px;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-btn {
  padding: 10px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  box-sizing: border-box;
}

.control-btn:hover {
  background: #2563eb;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.control-sliders {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.slider-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slider-label {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
}

.slider {
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.slider::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.slider-value {
  font-size: 0.75rem;
  color: #64748b;
  text-align: right;
  font-weight: 500;
}

/* 右侧：动画结果 */
.right-section {
  flex: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
}

.result-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
}

.result-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b5563;
  text-align: left;
  margin-bottom: 5px;
}

.result-placeholder {
  width: 100%;
  height: 450px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  aspect-ratio: 16/9;
}

.result-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.loading-state {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-result {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-result {
  color: #9ca3af;
  font-style: italic;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #4b5563;
  gap: 12px;
}

.is-loading {
  font-size: 2rem;
}

.generate-btn-container {
  display: flex;
  justify-content: center;
}

.generate-btn {
  width: 500px;
  padding: 15px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.generate-btn:hover:not(:disabled) {
  background: #2563eb;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .main-content {
    flex-direction: column;
    align-items: center;
  }

  .left-section {
    flex-direction: row;
    width: 100%;
    max-width: 600px;
  }

  .frame-container {
    flex: 1;
  }

  .control-section {
    width: 100%;
    max-width: 600px;
    flex-direction: row;
    align-items: center;
  }

  .control-buttons {
    width: 150px;
  }

  .control-sliders {
    flex: 1;
  }

  .right-section {
    width: 100%;
  }
}
</style>
