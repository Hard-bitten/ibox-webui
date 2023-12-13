<!-- src/views/Whisper.vue -->
<script lang="ts" setup>
import { transcribeAudio } from '@/services/whisperService';
import type { OutputType } from '@/services/whisperService';
import { reactive, ref, onMounted, nextTick } from 'vue';
import { AudioOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { isMobile } from '@/utils/agent'

enum MessageStatus {
  'recording', 'doing', 'done'
}

type Message = {
  id: Number,
  status: MessageStatus,
  content: String,
  format?: OutputType,
  audio: typeof Audio
}

const settingOpen = ref<Boolean>(false)
const messageHistory = ref<Message[]>([]);
const baseData = {
  supportedLanguages: [
    'zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'ru', 'ar', 'hi', 'it', 'pt', 'nl', 'sv', 'fi', 'da', 'no', 'pl', 'tr',
  ],
  supportedFormat: [
    'txt', 'vtt', 'srt', 'tsv', 'json'
  ],
}
const asrSetting = reactive({
  task: 'transcribe',
  language: 'zh',
  initialPrompt: '',
  vadFilter: true,
  wordTimestamps: false,
  outputFormat: 'txt',
})
const isRecordingMode = ref(true);
// 切换模式
const switchMode = async () => {
  isRecordingMode.value = !isRecordingMode.value;
  if (isRecordingMode.value) {
    await getRecordAccess()
  }
}

const mediaRecorder = ref<MediaRecorder>();
const audioChunks = ref([]);
const stream = ref<MediaStream>(); // MediaRecorder实例
async function getRecordAccess() {
  if (stream.value) {
    return
  }
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ audio: true });
    // 用户授予权限后，可以在这里创建MediaRecorder实例
    // 但是不要开始录音，除非用户点击了录音按钮
  } catch (err) {
    console.error('Cannot access media devices:', err);
  }
}
const isRecording = ref(false);
const startY = ref(0);
let stopType: 'stop' | 'cancel' | '' = ''
const threshold = 100; // 上滑取消的阈值，可根据需要调整

const recordStartTime = ref(0)
const startRecording = async (event) => {
  recordStartTime.value = new Date().getTime()
  if (!navigator.mediaDevices) {
    console.error('MediaDevices API not supported.');
    alert('MediaDevices API not supported.')
    return;
  }
  isRecording.value = true;
  startY.value = event.type === 'mousedown' ? event.clientY : event.touches[0].clientY;

  try {
    mediaRecorder.value = new MediaRecorder(stream.value);
    messageHistory.value.push({
      id: messageHistory.value.length + 1,
      audio: null,
      status: MessageStatus.recording,
      content: '',
      format: asrSetting.outputFormat
    })
    nextTick(()=>{
      historyAreaRef.value?.scrollTo({top:historyAreaRef.value.clientHeight})
    })

    mediaRecorder.value.ondataavailable = (event) => {
      audioChunks.value.push(event.data);
    };

    mediaRecorder.value.onstop = () => {
      if (stopType === 'cancel') {
        audioChunks.value = [];
        stopType = ''
        return
      }

      stopType = ''
      const audioBlob = new Blob(audioChunks.value, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      const item = messageHistory.value[messageHistory.value.length - 1]

      item.status = MessageStatus.doing

      // 清空 chunks 以便下次录音
      audioChunks.value = [];
      
      // 暂时下载音频文件
      // const u = URL.createObjectURL(audioBlob)
      // const a = document.createElement('a')
      // a.download = 'a.wav';
      // a.href = u;
      // a.click()
      // URL.revokeObjectURL(u)

      requestAndtranscribeAudio(audioBlob).then(text => {
        item.audio = audio
        item.content = text
        item.status = MessageStatus.done
        item.url = audioUrl;
      })
    };

    mediaRecorder.value.start();
  } catch (err) {
    console.error('Could not start recording:', err);
  }
};

const stopRecording = (event: MouseEvent | TouchEvent) => {
  console.log(event, 'dd')
  showTip.value = false;
  if (!isRecording.value) return;
  if (new Date().getTime() - recordStartTime.value < 1000) {
    // 1s内松手就取消录制
    handleRecordingCancel()
    return
  }
  const yOffset = event.type === 'mouseup' ? event.clientY : event.changedTouches[0].clientY;
  if (Math.abs(yOffset - startY.value) > threshold) {
    // 上滑距离超过阈值，取消录音
    handleRecordingCancel();
    return
  }
  stopType = 'stop'
  if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
    mediaRecorder.value.stop();
  }
  isRecording.value = false;
};

const showTip = ref(false)
const handleTouchMove = (event) => {
  if (!isRecording.value) return;

  const touchY = event.touches[0].clientY;
  if (startY.value - touchY > threshold) {
    // 上滑距离超过阈值，取消录音
    showTip.value = true
    // handleRecordingCancel();
  } else {
    showTip.value = false;
  }
};

onMounted(() => {
  const dom = document.querySelector('#recordBtnRef') as HTMLDivElement
  if (isMobile()) {
    dom?.addEventListener('touchstart', startRecording)
    dom?.addEventListener('touchend', stopRecording)
    dom?.addEventListener('touchmove', (e) => {
      e.preventDefault()
      handleTouchMove(e)
    })
    
  } else {
    dom?.addEventListener('mousedown', startRecording)
    dom?.addEventListener('mouseup', stopRecording)

  }
})

const handleRecordingCancel = () => {
  stopType = 'cancel'
  if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
    mediaRecorder.value.stop();
  }
  isRecording.value = false;
  messageHistory.value.splice(messageHistory.value.length - 1, 1)
  console.log('Recording cancelled');
  // 可以在这里处理取消录音后的逻辑，比如删除已经录制的音频片段等
};

const beforeUpload = (file) => {
  // 处理文件上传逻辑
  // file to blob
  const type = file.type;
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = (e) => {
    console.log(e, 'dddee')
    const blob = new Blob([e.target.result], {type: 'audio/wav'});
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    messageHistory.value.push({
      id: messageHistory.value.length + 1,
      audio: audio,
      status: MessageStatus.doing,
      content: '',
      format: asrSetting.outputFormat
    })
    const item = messageHistory.value[messageHistory.value.length - 1];
    requestAndtranscribeAudio1(blob).then(text => {
      item.content = text;
      item.status = MessageStatus.done;
    })
  }
  return false; // 阻止组件默认上传行为
};

const requestAndtranscribeAudio1 = async(file) => {
  try {
    let formData = new FormData();
    formData.append('audio_file', file, 'temp.wav');
    // Call the Whisper API for audio transcription
    const result = await transcribeAudio(asrSetting, formData);
    console.log('Transcription result:', result);
    return result
    // TODO: Handle the result as needed
  } catch (error) {
    console.error('Error transcribing audio:', error);
  }
}
const requestAndtranscribeAudio = async (blob: Blob) => {
  try {
    let formData = new FormData();
    let file = new File([blob], 'temp.wav')
    formData.append('audio_file', file, 'temp.wav');
    // Call the Whisper API for audio transcription
    const result = await transcribeAudio(asrSetting, formData);
    console.log('Transcription result:', result);
    return result
    // TODO: Handle the result as needed
  } catch (error) {
    console.error('Error transcribing audio:', error);
  }
}
const historyAreaRef = ref<HTMLDivElement>()

onMounted(async () => {
  if (isRecordingMode.value) {
    await getRecordAccess()
  }
  window.addEventListener('resize',()=>{
    innerHeight.value = window.innerHeight + 'px'
  })
});

const innerHeight = ref(window.innerHeight + 'px')

</script>

<template>
  <div :style="{height:innerHeight}" >
    <!-- <div v-if="showTip" class="absolute bottom-0 left-0 z-50">松开取消输入</div> -->
    <div class="flex flex-col h-full z-10">
      <!-- 记录区域 -->
      <div class="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-300 items-end" ref="historyAreaRef">
        <div v-for="(message,index) in messageHistory" :key="message.id" class="flex justify-end ">
          <a-card class="max-w-md w-full rounded-lg bg-blue-200" :class="[index === messageHistory.length-1?'z-50':'']">
            {{ message }}
            <audio controls :src="message.url"></audio>
            <p v-if="message.status === MessageStatus.recording">录制中...</p>
            <p v-else-if="message.status === MessageStatus.doing">识别中...</p>
            <p v-else>{{ message.content }}</p>
          </a-card>
        </div>
      </div>
      <!-- Recording Mask -->
      <!-- 发送/上传区域 -->
      <div class="shrink-0 p-4 border-t border-gray-200 select-none">
        <div v-if="isRecordingMode" class="flex justify-center items-center h-24 relative z-50">
          <!-- 录制按钮 -->
          <a-button type="primary" shape="circle" style="height: 72px;width:72px;" id="recordBtnRef"
            :class="{'record-btn-ani': isRecording && !showTip}"
            >
            <!--  @mousedown="startRecording"
            @mouseup="stopRecording" 
            @touchstart="startRecording"
            @touchend="stopRecording" 
            @touchmove.prevent="handleTouchMove"  -->
            <AudioOutlined :style="{ fontSize: '48px', color: isRecording ? null : 'white',userSelect:'none' }" />
            <!-- {{isRecording?'释放结束':'按住说话'}} -->
          </a-button>
        </div>
        <div v-else class="flex justify-center">
          <!-- 文件上传 -->
          <!-- accept="audio/*,video/*" -->
          <a-upload :beforeUpload="beforeUpload" :showUploadList="false" accept=".webm,.opus,.oga,.wma,.flac,.weba,.m4a,.wav,.ogg,.mp3,.ogm,.wmv,.mpg,.webm,.ogv,.mov,.asx">
            <a-button style="height: 50px;width:120px">
              <UploadOutlined />Upload
            </a-button>
          </a-upload>
        </div>
        <div class="float-right ">
          <a-button type="text" @click="switchMode">切换模式</a-button>
          <a-button type="text" @click="settingOpen = true">高级设置</a-button>
        </div>
      </div>
    </div>
    <div class="flex h-full w-full bg-slate-500 absolute top-0 left-0 z-20" v-if="isRecording">
    </div>
    <!-- Optional Parameters Section -->
    <a-drawer v-model:open="settingOpen" title="高级配置" placement="right">
      <a-form :labelCol="5">
        <a-form-item label="执行任务">
          <!-- Task Dropdown -->
          <a-select v-model="asrSetting.task" style="width: 200px; margin-bottom: 16px;">
            <a-select-option value="transcribe">语音转文字</a-select-option>
            <a-select-option value="translate">语音翻译到指定语言</a-select-option>
          </a-select>
        </a-form-item>


        <a-form-item label="目标语言">
          <!-- Language Dropdown -->
          <a-select v-model="asrSetting.language" style="width: 200px; margin-bottom: 16px;">
            <a-select-option v-for="lang in baseData.supportedLanguages" :key="lang" :value="lang">{{ lang
            }}</a-select-option>
          </a-select>
        </a-form-item>


        <a-form-item label="前置提示词">
          <!-- Initial Prompt Input -->
          <a-input v-model="asrSetting.initialPrompt" placeholder="Initial Prompt"
            style="width: 200px; margin-bottom: 16px;" />
        </a-form-item>


        <a-form-item label="是否启用VAD">
          <!-- VAD Filter Checkbox -->
          <a-checkbox v-model="asrSetting.vadFilter">Enable VAD Filter</a-checkbox>
        </a-form-item>

        <!-- Word Timestamps Checkbox -->
        <!-- <a-form-item label="时间戳">
                    <a-checkbox v-model="wordTimestamps">Word Timestamps</a-checkbox>
                </a-form-item> -->

        <a-form-item label="输出格式">
          <!-- Output Format Dropdown -->
          <a-select v-model="asrSetting.outputFormat" style="width: 200px; margin-bottom: 16px;">
            <a-select-option v-for="format in baseData.supportedFormat" :key="format" :value="format">{{ format
            }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-drawer>
  </div>
</template>

  
<style >
/* Add your custom styles here */
@keyframes scale-toggle {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(0.9);
  }
  50% {
    transform: scale(1);
  }
  75% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}
.my-container{
  /* @apply(h-screen) */
  height:100vh;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
.record-btn-ani {
  animation-name: scale-toggle;
  animation-duration: .7s;
  animation-delay: 0;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
}
</style>
  