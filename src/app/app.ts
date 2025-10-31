import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  score: number = 0;
  currentQuestion: {first: number, second: number} = {first: 0, second: 0};
  currentAnswers: number[] = [];
  correctAnswer: number = 0;
  selectedAnswer: number | null = null;
  showResult: boolean = false;
  isAnsweredCorrectly: boolean = false;
  isScoreGreen: boolean = false;
  isScoreRed: boolean = false;
  greenTimeout: any = null;
  redTimeout: any = null;
  
  // Progresif öğrenme sistemi
  allQuestions: {first: number, second: number}[] = [];
  currentWindowStart: number = 0;
  windowSize: number = 6;
  lastLevelScore: number = 0; // Son seviye atladığımız puan
  lastQuestion: {first: number, second: number} | null = null; // Son sorulan soru
  lastAnswerPositions: number[] = []; // Son buton pozisyonları
  questionStartTime: number = 0; // Soru başlangıç zamanı

  constructor() {
    this.initializeQuestions();
    this.generateNewQuestion();
  }

  initializeQuestions() {
    // 1x1'den 10x10'a kadar tüm çarpım sorularını sıralı olarak oluştur
    this.allQuestions = [];
    
    // 1x1, 1x2, 2x1, 2x2, 2x3, 3x2, 3x3, ... şeklinde sıralama
    for (let sum = 2; sum <= 20; sum++) { // 1+1=2'den 10+10=20'ye kadar
      for (let first = 1; first <= 10; first++) {
        let second = sum - first;
        if (second >= 1 && second <= 10) {
          this.allQuestions.push({first, second});
        }
      }
    }
  }

  updateDifficultyLevel() {
    // Her 100 puanda 3 soru ileri kaydır
    const newLevel = Math.floor(this.score / 100);
    const currentLevel = Math.floor(this.lastLevelScore / 100);
    
    if (newLevel > currentLevel) {
      // Seviye atladı - pencereyi 3 ileri kaydır
      this.currentWindowStart = Math.min(
        this.currentWindowStart + 3,
        Math.max(0, this.allQuestions.length - this.windowSize)
      );
      this.lastLevelScore = newLevel * 100;
    }
  }

  selectDifferentQuestion(questions: {first: number, second: number}[]): {first: number, second: number} {
    // Son sorudan farklı bir soru seç
    if (!this.lastQuestion || questions.length === 1) {
      // İlk soru veya tek seçenek varsa
      const randomIndex = Math.floor(Math.random() * questions.length);
      return questions[randomIndex];
    }
    
    // Son sorudan farklı sorular
    const differentQuestions = questions.filter(q => 
      !(q.first === this.lastQuestion!.first && q.second === this.lastQuestion!.second)
    );
    
    if (differentQuestions.length === 0) {
      // Eğer tüm sorular aynıysa (pencere çok küçükse) random seç
      const randomIndex = Math.floor(Math.random() * questions.length);
      return questions[randomIndex];
    }
    
    const randomIndex = Math.floor(Math.random() * differentQuestions.length);
    return differentQuestions[randomIndex];
  }

  generateAnswerOptions() {
    // 4 cevap seçeneği oluştur (1 doğru, 3 yanlış)
    this.currentAnswers = [this.correctAnswer];
    
    // 3 yanlış cevap ekle
    while (this.currentAnswers.length < 4) {
      let wrongAnswer = this.correctAnswer + Math.floor(Math.random() * 20) - 10;
      if (wrongAnswer > 0 && !this.currentAnswers.includes(wrongAnswer)) {
        this.currentAnswers.push(wrongAnswer);
      }
    }
    
    // Cevapları karıştır (buton pozisyonları farklı olacak şekilde)
    this.currentAnswers = this.shuffleArrayWithDifferentPositions([...this.currentAnswers]);
    
    // Bu sefer ki pozisyonları kaydet
    this.lastAnswerPositions = [...this.currentAnswers];
  }

  shuffleArrayWithDifferentPositions(array: number[]): number[] {
    // İlk çalışmada veya pozisyon kontrolü gereksizse normal shuffle
    if (this.lastAnswerPositions.length === 0) {
      return this.shuffleArray(array);
    }
    
    // En fazla 10 deneme yap farklı pozisyon için
    for (let attempt = 0; attempt < 10; attempt++) {
      const shuffled = this.shuffleArray([...array]);
      
      // Aynı pozisyonlarda aynı sayılar var mı kontrol et
      let hasConflict = false;
      for (let i = 0; i < Math.min(shuffled.length, this.lastAnswerPositions.length); i++) {
        if (shuffled[i] === this.lastAnswerPositions[i]) {
          hasConflict = true;
          break;
        }
      }
      
      if (!hasConflict) {
        return shuffled;
      }
    }
    
    // 10 denemede bulamazsa normal shuffle döndür
    return this.shuffleArray(array);
  }

  calculateSpeedBonus(): number {
    const responseTime = (Date.now() - this.questionStartTime) / 1000; // saniye cinsinden
    
    if (responseTime <= 2) {
      return 10; // 0-2 saniye: 10 puan
    } else if (responseTime <= 3) {
      return 8;  // 2-3 saniye: 8 puan
    } else if (responseTime <= 4) {
      return 6;  // 3-4 saniye: 6 puan
    } else if (responseTime <= 5) {
      return 4;  // 4-5 saniye: 4 puan
    } else if (responseTime <= 6) {
      return 2;  // 5-6 saniye: 2 puan
    } else {
      return 1;  // 6+ saniye: 1 puan
    }
  }

  generateNewQuestion() {
    // Progresif zorluk sistemi - her 100 puanda pencereyi 3 ileri kaydır
    this.updateDifficultyLevel();
    
    // Mevcut pencereden rastgele soru seç (son sorudan farklı olacak şekilde)
    const availableQuestions = this.allQuestions.slice(
      this.currentWindowStart, 
      this.currentWindowStart + this.windowSize
    );
    
    let selectedQuestion: {first: number, second: number};
    
    if (availableQuestions.length === 0) {
      // Eğer sorular bittiyse, son seviyeyi tekrarla
      this.currentWindowStart = Math.max(0, this.allQuestions.length - this.windowSize);
      const fallbackQuestions = this.allQuestions.slice(
        this.currentWindowStart, 
        this.currentWindowStart + this.windowSize
      );
      selectedQuestion = this.selectDifferentQuestion(fallbackQuestions);
    } else {
      selectedQuestion = this.selectDifferentQuestion(availableQuestions);
    }
    
    this.currentQuestion = selectedQuestion;
    this.lastQuestion = {...selectedQuestion}; // Son soruyu kaydet
    
    // Doğru cevap
    this.correctAnswer = this.currentQuestion.first * this.currentQuestion.second;
    
    // 4 cevap seçeneği oluştur (buton pozisyonları farklı olacak şekilde)
    this.generateAnswerOptions();
    
    // Sonuç gösterimini sıfırla
    this.showResult = false;
    this.selectedAnswer = null;
    this.isAnsweredCorrectly = false;
    
    // Süre tutmaya başla
    this.questionStartTime = Date.now();
  }

  selectAnswer(answer: number) {
    if (this.showResult) {
      // Eğer yanlış cevap verilmişse ve doğru cevaba basıldıysa
      if (!this.isAnsweredCorrectly && answer === this.correctAnswer) {
        this.generateNewQuestion();
      }
      return;
    }
    
    this.selectedAnswer = answer;
    this.showResult = true;
    
    if (answer === this.correctAnswer) {
      // Hız bonusuna göre puan ekle
      const speedBonus = this.calculateSpeedBonus();
      this.score += speedBonus;
      this.isAnsweredCorrectly = true;
      
      // Score'u yeşile çevir (0.35s fade in)
      this.isScoreGreen = true;
      
      // Eğer önceki timeout varsa iptal et (hızlı bilme durumu)
      if (this.greenTimeout) {
        clearTimeout(this.greenTimeout);
      }
      
      // 0.65s sonra (0.35 fade in + 0.3 constant) fade out başlat
      this.greenTimeout = setTimeout(() => {
        this.isScoreGreen = false; // 0.35s fade out
        this.greenTimeout = null;
      }, 650);
      
      // Hemen yeni soruya geç
      this.generateNewQuestion();
    } else {
      // Yanlış cevap - hız bonusuna göre puan eksilt
      const speedBonus = this.calculateSpeedBonus();
      this.score -= speedBonus;
      this.isAnsweredCorrectly = false;
      
      // Score'u kırmızıya çevir (0.35s fade in)
      this.isScoreRed = true;
      
      // Eğer önceki timeout varsa iptal et
      if (this.redTimeout) {
        clearTimeout(this.redTimeout);
      }
      
      // 0.65s sonra (0.35 fade in + 0.3 constant) fade out başlat
      this.redTimeout = setTimeout(() => {
        this.isScoreRed = false; // 0.35s fade out
        this.redTimeout = null;
      }, 650);
    }
  }

  private shuffleArray(array: number[]): number[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}