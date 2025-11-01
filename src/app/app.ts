import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'app-root',
	imports: [CommonModule],
	templateUrl: './app.html',
	styleUrl: './app.css',
})
export class App {
	score: number = 0;
	currentQuestion: { first: number; second: number } = { first: 0, second: 0 };
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
	allQuestions: { first: number; second: number }[] = [];
	currentWindowStart: number = 0;
	windowSize: number = 6;
	lastLevelScore: number = 0; // Son seviye atladığımız puan
	lastQuestion: { first: number; second: number } | null = null; // Son sorulan soru
	lastAnswerPositions: number[] = []; // Son buton pozisyonları

	// Adaptif öğrenme sistemi - her sorunun puan geçmişi
	questionScores: number[][] = []; // Her soru için puan listesi
	currentQuestionIndex: number = -1; // Şu anki sorunun indexi
	questionStartTime: number = 0; // Soru başlangıç zamanı

	constructor() {
		this.initializeQuestions();
		this.initializeQuestionScores();
		this.loadProgressFromStorage();
		this.generateNewQuestion();
	}

	initializeQuestions() {
		// 1x1'den 10x10'a kadar tüm çarpım sorularını sıralı olarak oluştur
		this.allQuestions = [];

		// 1x1, 1x2, 2x1, 2x2, 2x3, 3x2, 3x3, ... şeklinde sıralama
		for (let sum = 2; sum <= 20; sum++) {
			// 1+1=2'den 10+10=20'ye kadar
			for (let first = 1; first <= 10; first++) {
				let second = sum - first;
				if (second >= 1 && second <= 10) {
					this.allQuestions.push({ first, second });
				}
			}
		}
	}

	initializeQuestionScores() {
		// Her soru için boş puan listesi oluştur
		this.questionScores = [];
		for (let i = 0; i < this.allQuestions.length; i++) {
			this.questionScores.push([]);
		}
	}

	updateDifficultyLevel() {
		// Her 25 puanda 3 soru ileri kaydır
		const newLevel = Math.floor(this.score / 25);
		const currentLevel = Math.floor(this.lastLevelScore / 25);

		if (newLevel > currentLevel) {
			// Seviye atladı - pencereyi 3 ileri kaydır
			this.currentWindowStart = Math.min(
				this.currentWindowStart + 3,
				Math.max(0, this.allQuestions.length - this.windowSize),
			);
			this.lastLevelScore = newLevel * 25;
		}
	}

	selectDifferentQuestion(questions: { first: number; second: number }[]): {
		first: number;
		second: number;
	} {
		// Son sorudan farklı bir soru seç
		if (!this.lastQuestion || questions.length === 1) {
			// İlk soru veya tek seçenek varsa
			const randomIndex = Math.floor(Math.random() * questions.length);
			return questions[randomIndex];
		}

		// Son sorudan farklı sorular
		const differentQuestions = questions.filter(
			(q) =>
				!(q.first === this.lastQuestion!.first && q.second === this.lastQuestion!.second),
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
			return 8; // 2-3 saniye: 8 puan
		} else if (responseTime <= 4) {
			return 6; // 3-4 saniye: 6 puan
		} else if (responseTime <= 5) {
			return 4; // 4-5 saniye: 4 puan
		} else if (responseTime <= 6) {
			return 2; // 5-6 saniye: 2 puan
		} else {
			return 1; // 6+ saniye: 1 puan
		}
	}

	generateNewQuestion() {
		// Progresif zorluk sistemi - her 25 puanda pencereyi 3 ileri kaydır
		this.updateDifficultyLevel();

		let selectedQuestion: { first: number; second: number };

		// Pencere sona geldiyse %100 geçmiş sorulardan seç
		const isAtEnd = this.currentWindowStart >= this.allQuestions.length - this.windowSize;

		if (isAtEnd) {
			// Pencere sona geldi - adaptif seçimle geçmiş sorulardan seç
			selectedQuestion = this.selectQuestionAdaptively(0, this.currentWindowStart);
		} else {
			// Pencere devam ediyor - %20 geçmiş, %80 mevcut pencere
			const shouldUseHistoricalQuestion = this.currentWindowStart > 0 && Math.random() < 0.2;

			if (shouldUseHistoricalQuestion) {
				// Adaptif seçimle geçmiş sorulardan seç
				selectedQuestion = this.selectQuestionAdaptively(0, this.currentWindowStart);
			} else {
				// Mevcut pencereden normal seçim
				const availableQuestions = this.allQuestions.slice(
					this.currentWindowStart,
					this.currentWindowStart + this.windowSize,
				);
				selectedQuestion = this.selectDifferentQuestion(availableQuestions);
			}
		}

		// Seçilen sorunun indexini bul
		this.currentQuestionIndex = this.allQuestions.findIndex(
			(q) => q.first === selectedQuestion.first && q.second === selectedQuestion.second,
		);

		this.currentQuestion = selectedQuestion;
		this.lastQuestion = { ...selectedQuestion }; // Son soruyu kaydet

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

			// Progress'i kaydet
			this.saveProgressToStorage();

			// Bu soruya aldığı puanı kaydet
			this.recordQuestionScore(speedBonus);

			// Hemen yeni soruya geç
			this.generateNewQuestion();
		} else {
			// Yanlış cevap - hız bonusuna göre puan eksilt
			const speedBonus = this.calculateSpeedBonus();
			this.score -= speedBonus;

			// Bu soruya aldığı puanı kaydet (negatif)
			this.recordQuestionScore(-speedBonus);

			// Progress'i kaydet
			this.saveProgressToStorage();
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

	private saveProgressToStorage(): void {
		const progress = {
			score: this.score,
			currentWindowStart: this.currentWindowStart,
			lastLevelScore: this.lastLevelScore,
			questionScores: this.questionScores,
			timestamp: new Date().getTime(),
		};
		localStorage.setItem('multiplicationTableProgress', JSON.stringify(progress));
	}

	private loadProgressFromStorage(): void {
		try {
			const progressStr = localStorage.getItem('multiplicationTableProgress');
			if (progressStr) {
				const progress = JSON.parse(progressStr);

				// Kaydedilmiş progress'i yükle (zaman sınırı yok)
				this.score = progress.score || 0;
				this.currentWindowStart = progress.currentWindowStart || 0;
				this.lastLevelScore = progress.lastLevelScore || 0;
				this.questionScores = progress.questionScores || this.questionScores;
			}
		} catch (error) {
			console.warn('Progress yüklenirken hata:', error);
			this.resetProgress();
		}
	}

	resetProgress(): void {
		this.score = 0;
		this.currentWindowStart = 0;
		this.lastLevelScore = 0;
		// Soru skorlarını da sıfırla
		this.initializeQuestionScores();
		localStorage.removeItem('multiplicationTableProgress');
		this.generateNewQuestion();
	}

	// Adaptif öğrenme sistemi metodları
	recordQuestionScore(score: number): void {
		if (
			this.currentQuestionIndex >= 0 &&
			this.currentQuestionIndex < this.questionScores.length
		) {
			this.questionScores[this.currentQuestionIndex].push(score);

			// Sadece son 10 skoru tut (hafıza optimizasyonu)
			if (this.questionScores[this.currentQuestionIndex].length > 10) {
				this.questionScores[this.currentQuestionIndex] =
					this.questionScores[this.currentQuestionIndex].slice(-10);
			}
		}
	}

	selectQuestionAdaptively(
		startIndex: number,
		endIndex: number,
	): { first: number; second: number } {
		const availableQuestions = this.allQuestions.slice(startIndex, endIndex);

		if (availableQuestions.length === 0) {
			// Fallback: mevcut pencereden seç
			const fallbackQuestions = this.allQuestions.slice(
				this.currentWindowStart,
				this.currentWindowStart + this.windowSize,
			);
			return this.selectDifferentQuestion(fallbackQuestions);
		}

		// Her soru için ağırlık hesapla
		const weights: number[] = [];

		for (let i = startIndex; i < endIndex; i++) {
			const scores = this.questionScores[i];

			if (scores.length === 0) {
				// Hiç sorulmamış soru - orta ağırlık
				weights.push(1.0);
			} else {
				// Ortalama puan hesapla
				const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

				// Düşük/negatif puan = yüksek ağırlık (daha çok sorulacak)
				// Negatif puanlar için daha agresif ağırlık
				let weight: number;
				if (avgScore < 0) {
					// Negatif puanlar için çok yüksek ağırlık
					weight = Math.abs(avgScore) + 2; // -10 → 12 ağırlık
				} else {
					// Pozitif puanlar için ters orantılı ağırlık
					weight = 1 / (avgScore + 1);
				}
				weights.push(weight);
			}
		}

		// Ağırlıklı rastgele seçim
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		let random = Math.random() * totalWeight;

		for (let i = 0; i < weights.length; i++) {
			random -= weights[i];
			if (random <= 0) {
				const selectedQuestion = availableQuestions[i];

				// Son sorudan farklı olması için kontrol
				if (
					this.lastQuestion &&
					selectedQuestion.first === this.lastQuestion.first &&
					selectedQuestion.second === this.lastQuestion.second
				) {
					// Eğer aynı soru seçildiyse bir sonrakini dene
					const nextIndex = (i + 1) % availableQuestions.length;
					return availableQuestions[nextIndex];
				}

				return selectedQuestion;
			}
		}

		// Fallback (teorik olarak ulaşılmamalı)
		return availableQuestions[0];
	}
}
