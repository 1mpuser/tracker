'use client';

import { useState } from 'react';
import styles from './DayRatingBlock.module.css';

interface DayRatingBlockProps {
  rating: number | null;
  comment: string | null;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
}

export default function DayRatingBlock({ rating, comment, onRatingChange, onCommentChange }: DayRatingBlockProps) {
  const [liveRating, setLiveRating] = useState(rating ?? 5);
  const [commentDraft, setCommentDraft] = useState(comment ?? '');

  function commitRating() {
    onRatingChange(liveRating);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>Оценка дня</div>
      <div className={styles.sliderRow}>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={liveRating}
          className={styles.slider}
          onChange={(e) => setLiveRating(Number(e.target.value))}
          onMouseUp={commitRating}
          onTouchEnd={commitRating}
        />
        <span className={`${styles.value} ${rating === null ? styles.valueEmpty : ''}`}>
          {rating === null ? '—' : liveRating}
          <span>/10</span>
        </span>
      </div>
      <input
        type="text"
        className={styles.comment}
        placeholder="Комментарий к дню…"
        maxLength={200}
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
        onBlur={() => onCommentChange(commentDraft)}
      />
    </div>
  );
}
