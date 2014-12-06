goog.provide('app.Game');

goog.require('app.Constants');
goog.require('app.Quiz');
goog.require('app.shared.Coordinator');
goog.require('app.shared.LevelUp');
goog.require('app.shared.Scoreboard');
goog.require('app.shared.Gameover');
goog.require('app.shared.utils');



/**
 * The trivia game.
 * @param scene
 * @param elem
 * @constructor
 * @export
 */
app.Game = function(scene, elem) {
  this.scene = scene;
  this.elem = elem;

  this.current = {number: 0};
  this.paused = false;
  this.gameStartTime = +new Date;

  this.scoreboard = new app.shared.Scoreboard(this, elem.querySelector('.board'));
  this.gameoverView = new app.shared.Gameover(this, elem.querySelector('.gameover'));
  this.quiz = new app.Quiz(this, elem.querySelector('.quiz'), this.current);
  this.levelUp = new app.shared.LevelUp(this,
    $(this.elem.querySelector('.levelup')), $(this.elem.querySelector('.levelup--number')));

  this.onFrame = this.onFrame.bind(this);
};

/**
 * Game loop. Runs every frame using requestAnimationFrame.
 */
app.Game.prototype.onFrame = function() {
  // Calculate delta since last frame.
  var now = +new Date() / 1000;
  var delta = Math.min(1, now - this.lastFrame);
  this.lastFrame = now;

  if (this.countdownActive) {
    this.scoreboard.onFrame(delta);
  }
  app.shared.Coordinator.onFrame(delta);

  // Request next frame
  this.requestId = app.shared.utils.requestAnimFrame(this.onFrame);
};

/**
 * Transition to the next level.
 * @private
 */
app.Game.prototype.bumpLevel_ = function() {
  // Next level
  this.level++;
  if (this.level === app.Constants.TOTAL_LEVELS) {
    this.gameover(true);
  } else if (this.scoreboard.score < app.Constants.SCORE_LIMIT[this.level]) {
    this.gameover(true);
  } else {
    this.levelUp.show(this.level + 1, function() {
      this.scoreboard.setLevel(this.level);
      this.current.number = 0;
      this.nextQuestion_();
    }.bind(this));
  }
};

/**
 * Starts the game.
 * @param {string} difficulty
 * @export
 */
app.Game.prototype.start = function(difficulty) {
  this.quiz.setDifficulty(difficulty);
  this.restart();
};

/**
 * Restarts the game. Can be called at any time.
 */
app.Game.prototype.restart = function() {
  // Cleanup last game
  var match = location.search.match(/[?&]level=(\d+)/) || [];
  this.level = (+match[1] || 1) - 1;
  this.paused = false;
  this.current.number = 0;
  this.countdownActive = false;
  this.isGameover = false;

  this.scoreboard.reset();

  // Start game
  window.santaApp.fire('sound-trigger', 'trivia_game_start');
  window.santaApp.fire('analytics-track-game-start', {gameid: 'trivia'});

  this.nextQuestion_();

  this.lastFrame = +new Date() / 1000;
  this.requestId = app.shared.utils.requestAnimFrame(this.onFrame);
};

/**
 * Stops the game as game over. Displays the game over screen as well.
 */
app.Game.prototype.gameover = function(really) {
  // Check if count down on scoreboard is over
  if (!really && this.scoreboard.countdown === 0) {
    this.scene.fire('time-up');
    return;
  }

  this.isGameover = true;
  this.gameoverView.show();
  window.santaApp.fire('sound-trigger', 'trivia_game_over');
  window.santaApp.fire('analytics-track-game-over', {
    gameid: 'trivia',
    score: this.scoreboard.score,
    level: this.level,
    timePlayed: new Date - this.gameStartTime
  });
};

/**
 * Pauses/unpauses the game.
 */
app.Game.prototype.togglePause = function() {
  if (this.paused) {
    this.resume();
  // Only allow pausing if the game is playing (not game over).
  } else {
    this.pause();
  }
};

/**
 * Pause the game.
 */
app.Game.prototype.pause = function() {
  this.paused = true;
};

/**
 * Resume the game.
 */
app.Game.prototype.resume = function() {
  this.paused = false;

  if (!this.isGameover && !this.countdownActive) {
    this.nextQuestion_();
  }
};

/**
 * Cleanup
 * @export
 */
app.Game.prototype.dispose = function() {
  window.santaApp.fire('analytics-track-game-quit', {
    gameid: 'trivia',
    timePlayed: new Date - this.gameStartTime
  });

  app.shared.utils.cancelAnimFrame(this.requestId);
  $(window).off('.trivia');
  $(document).off('.trivia');
};

/**
 * Answer the current question.
 * @param isCorrect Is the answer correct?
 */
app.Game.prototype.answer = function(isCorrect) {
  if (isCorrect) {
    var score = this.quiz.calculateScore(this.scoreboard.countdown);
    this.scoreboard.addScore(score);
  }
  if (this.current.number === app.Constants.QUESTIONS_PER_LEVEL) {
    this.bumpLevel_();
  } else {
    this.nextQuestion_();
  }
};

/**
 * Show next question.
 * @private
 */
app.Game.prototype.nextQuestion_ = function() {
  this.countdownActive = false;
  this.scoreboard.restart();

  app.shared.Coordinator.after(app.Constants.PAUSE_BETWEEN_QUESTIONS, function() {
    if (this.paused) return;

    this.quiz.nextQuestion();
    this.scene.fire('new-question');
  }.bind(this));
};
