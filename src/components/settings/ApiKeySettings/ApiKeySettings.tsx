/**
 * API 키 설정.
 *
 * 기준: v2 제품정의 §7(키 취급 7개 규칙). 하네스 P4 할 일 2, DoD 2·3·6.
 *
 * 규칙이 화면에서 지켜지는 자리다.
 *
 * - 저장한 뒤에는 입력칸을 비운다. 전체 키를 화면에 다시 두지 않는다. (§7-5)
 * - 삭제 버튼은 키가 있든 없든 같은 자리에 있다. (§7-4)
 * - 브라우저에 저장된다는 사실과 전용 키를 쓰라는 안내를 접어 두지 않는다.
 *   (§7-3, §7-7)
 *
 * 전체 키는 이 컴포넌트에 **머무르기만** 한다 - 붙여넣은 값을 저장소로 넘기고
 * 나면 지운다. 상태로 올리지 않는다.
 */

import { useState } from 'react';

import type { ApiKeyState } from '../../../storage/api-key.store.ts';
import { Button } from '../../ui/Button/Button.tsx';
import { Field } from '../../ui/Field/Field.tsx';
import { Input } from '../../ui/Input/Input.tsx';
import styles from './ApiKeySettings.module.css';

export interface ApiKeySettingsProps {
  state: ApiKeyState;
  /** 형식 오류. 저장소가 만든 문장이라 입력을 인용하지 않는다. */
  error?: string;
  justSaved: boolean;
  /** 저장에 성공했으면 `true`. 그때만 입력칸을 비운다. */
  onSave: (value: string) => boolean;
  onRemove: () => void;
}

export function ApiKeySettings({ state, error, justSaved, onSave, onRemove }: ApiKeySettingsProps) {
  const [draft, setDraft] = useState('');

  return (
    <div className={styles.wrapper}>
      <p className={styles.warning} data-testid="api-key-warning">
        이 키는 <strong>이 브라우저에</strong> 저장됩니다. 서버로 보내지 않고,
        <strong> api.anthropic.com </strong>외 어디로도 나가지 않습니다. 공용 기기에서는 쓰지
        마세요.
      </p>
      <p className={styles.warning} data-testid="api-key-dedicated">
        HowSheet 전용 키를 <strong>새로 발급해</strong> 쓰세요. 다른 곳과 공유하지 않는 키여야
        유출됐을 때 그 키만 폐기하면 됩니다.
      </p>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          // 성공했을 때만 비운다. 형식 오류로 되돌아왔는데 지우면 붙여넣은 값을
          // 사용자가 다시 찾아와야 한다.
          if (onSave(draft)) setDraft('');
        }}
      >
        <Field
          label="Anthropic API 키"
          help="sk-ant- 로 시작하는 키를 붙여넣습니다. 키가 없어도 템플릿으로 프롬프트를 만들 수 있습니다."
          {...(error === undefined ? {} : { error })}
        >
          {(control) => (
            <Input
              {...control}
              // 어깨너머로 보이지 않게 가린다. 저장한 뒤에는 이 칸 자체를 비운다.
              type="password"
              autoComplete="off"
              spellCheck={false}
              data-testid="api-key-input"
              placeholder="sk-ant-..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
        </Field>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            data-testid="api-key-save"
            disabled={draft === ''}
          >
            저장
          </Button>
          {/* 키가 없어도 자리를 지킨다. 찾아 헤매게 두지 않는다. (§7-4) */}
          <Button
            variant="danger"
            data-testid="api-key-remove"
            disabled={!state.present}
            onClick={onRemove}
          >
            키 삭제
          </Button>
        </div>
      </form>

      <p className={styles.status} data-testid="api-key-status">
        {state.present ? (
          <>
            <span className={styles.badge}>저장됨</span>
            <span className={styles.masked} data-testid="api-key-masked">
              {state.masked}
            </span>
            <span className={styles.note}>전체 키는 다시 보이지 않습니다.</span>
          </>
        ) : (
          <>
            <span className={styles.badge}>없음</span>
            <span className={styles.note}>저장된 키가 없습니다. 템플릿 조립으로 동작합니다.</span>
          </>
        )}
      </p>

      {state.mode === 'memory' && state.unavailableReason !== undefined ? (
        <p className={styles.warning} role="status" data-testid="api-key-memory">
          {state.unavailableReason}
        </p>
      ) : null}

      {justSaved ? (
        <p className="sr-only" role="status">
          키를 저장했습니다. 전체 키는 다시 보이지 않습니다.
        </p>
      ) : null}
    </div>
  );
}
