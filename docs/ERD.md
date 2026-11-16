# 데이터 테이블 구조 (ERD)

게임 데이터는 **두 레이어**로 나뉜다(v2). **전역(런) 표**는 `data/` 루트에 한 벌만 두고 모든
스테이지가 공유하며(플레이어가 들고 다니는 정의 + 외부 참조 없는 어휘), **스테이지 표**는
`data/<stage>/` 폴더마다 둔다(이 보드의 배치·스크립트). 아래 다이어그램은 각 테이블이 어떤 열로
다른 테이블을 참조하는지 보여준다. 모든 참조는 문자열 id 매칭이며, 런타임에 `Map`으로 인덱싱해 푼다.

**불변식:** 스테이지 표는 전역 표를 자유롭게 가리켜도 되지만, 전역 표는 스테이지 행을 가리키지 않는다
(그래서 자원·상태가 스테이지를 넘어 이어진다 — `validate`가 이 방향을 강제한다).

- **전역(런):** `STATS` · `DERIVED` · `GENERATION` · `ASSETS` · `STAGES` · `META`
- **스테이지:** `CONFIG` · `TILES` · `EDGES` · `EVENTS` · `CHOICES` · `EFFECTS` · `CONDITIONS` · `TILE_EVENTS` (+선택: `ENDINGS` · `CHARACTERS` · `THRESHOLDS` · `ENEMIES` · `ITEMS`)

각 CSV는 3행 헤더(1행 한글명 / 2행 변수명 / 3행 타입)를 쓴다. 아래 속성 이름은 2행(변수명) 기준이다.
컬럼 설명과 enum은 엑셀 워크북의 `_안내` 시트에도 있다.

```mermaid
erDiagram
    STATS {
        string id PK
        string label
        string icon
        string kind "number|bool|status"
        int    min
        int    max
        int    start
        int    decay "턴당 자동 증감"
        bool   visible
        string display "bar|counter|flag|hidden"
        int    duration "status: 기본 지속 턴"
        int    max_stacks "status: 중첩 한도"
        string per_turn_target FK "status: → stats.id (매 턴 증감 대상)"
        int    per_turn_amount "status: 매 턴 증감량(중첩 곱)"
    }
    DERIVED {
        string id PK "형식상 surrogate"
        string target FK "→ stats.id (계산 전용)"
        string term FK "→ stats.id (빈=상수)"
        float  factor
    }
    GENERATION {
        string id PK "형식상 surrogate"
        string region
        string tile_type "→ tiles.type"
        int    weight
    }
    ASSETS {
        string id PK
        string kind "image|audio|sprite"
        string path
        string speaker "sprite: 기본 화자명"
        string expr "sprite: 표정 태그(자리)"
        string pos "sprite: left|center|right"
    }
    STAGES {
        string id PK
        string name
        string config_path "데이터 폴더 경로"
        int    unlock_cost
        string icon
    }
    META {
        string id PK
        string label
        int    cost
        string effect_kind
        string target FK "→ stats.id"
        int    value
        int    max_rank
    }
    CONFIG {
        string key PK
        string value
    }
    TILES {
        string id PK
        int    x
        int    y
        string type FK "→ generation/tile_events"
        string sprite FK "→ assets.id (전역)"
        string event_id FK "→ events.id"
        string region
        bool   locked
        string label
        bool   stop "1=강제 정지(스킵 불가)"
    }
    EDGES {
        string id PK "형식상 surrogate"
        string from FK "→ tiles.id"
        string to FK "→ tiles.id"
        string label "빈값=주경로, 분기면 버튼 문구"
        string cond_group FK "→ conditions.group_id"
    }
    EVENTS {
        string id PK
        string type "EFFECT|CHOICE|MOVE|NONE"
        string cond_group FK "→ conditions.group_id"
        float  probability
        string payload FK "→ effects.group_id"
        string title
        string text
        string icon "이모지"
        string image FK "→ 이미지파일"
        string background FK "VN: → assets.id / 색"
        string speaker "VN: 대사 창 화자명"
        string sprite FK "VN: → assets.id(sprite)"
    }
    CHOICES {
        string id PK "형식상 surrogate"
        string event_id FK "→ events.id"
        string choice_id "이벤트 내 지역 키"
        string text
        string cond_group FK "→ conditions.group_id"
        string result_effect_id FK "→ effects.group_id"
        string next_event FK "→ events.id (연속 선택지)"
    }
    EFFECTS {
        string id PK
        string group_id "참조 키(payload/result_effect_id). 같은 group_id=seq순 실행"
        int    seq
        string kind "GAIN|LOSE|SET|MOVE_*|RUN_EVENT|APPLY_STATUS|GIVE_ITEM|..."
        string target FK "→ stats.id / tiles.id / events.id / items.id (kind별)"
        string value
    }
    CONDITIONS {
        string id PK "형식상 surrogate(참조 안 함)"
        string group_id "참조 키(cond_group). 같은 group_id=AND"
        string subject "stats.id / flag.x / status.x / item.x"
        string op "min|max|over|under|is|not"
        string value
    }
    TILE_EVENTS {
        string id PK "형식상 surrogate"
        string tile_type "→ tiles.type"
        string event_id FK "→ events.id"
        int    weight
        string cond_group FK "→ conditions.group_id"
    }
    CHARACTERS {
        string id PK
        string name
        string portrait "이모지 또는 경로(config.portrait 덮어씀)"
        string desc
        string start_effect_group FK "→ effects.group_id (시작 1회)"
        string icon
    }
    THRESHOLDS {
        string id PK
        string subject "stats.id / flag.x / status.x"
        string op "min|max|over|under|is|not"
        string value
        string event FK "→ events.id"
        string effect FK "→ effects.group_id"
        string mode "once|repeat"
    }
    ENEMIES {
        string id PK
        string label
        string start FK "→ tiles.id"
        string behavior "chase|wander|ambush|turret|ranged"
        int    speed
        int    damage
        string event FK "→ events.id (접촉/사격)"
        int    vision
        string contact "move|pass|both"
        string sprite FK "→ assets.id (전역)"
        string cond_group FK "→ conditions.group_id"
    }
    ITEMS {
        string id PK
        string name
        string icon
        string desc
        string use_effect_group FK "→ effects.group_id"
        bool   consumable
        int    max_stack
        string cond_group FK "→ conditions.group_id"
    }
    ENDINGS {
        string id PK
        string when "victory|defeat|any"
        string cond_group FK "→ conditions.group_id"
        int    priority
        string title
        string image FK "→ 이미지파일"
    }

    STAGES        ||--|| CONFIG       : "config_path 폴더"
    STATS         }o--o| STATS        : "per_turn_target (status)"
    DERIVED       }o--|| STATS        : "target / term"
    META          }o--|| STATS        : "target"
    EDGES         }o--|| TILES        : "from"
    EDGES         }o--|| TILES        : "to"
    TILES         }o--o| EVENTS       : "event_id (사전배치)"
    TILES         }o--o| ASSETS       : "sprite (전역)"
    TILES         }o--o{ GENERATION   : "type ↔ tile_type (전역)"
    TILES         }o--o{ TILE_EVENTS  : "type ↔ tile_type"
    EVENTS        ||--o{ CHOICES      : "event_id"
    EVENTS        }o--o| EFFECTS      : "payload"
    EVENTS        }o--o| ASSETS       : "image"
    EVENTS        }o--o| ASSETS       : "VN background / sprite"
    CHOICES       }o--o| EFFECTS      : "result_effect_id"
    CHOICES       }o--o| EVENTS       : "next_event (체인)"
    EFFECTS       }o--o| STATS        : "target (GAIN/LOSE/SET, APPLY/CLEAR_STATUS)"
    EFFECTS       }o--o| EVENTS       : "RUN_EVENT target (체인)"
    EFFECTS       }o--o| ITEMS        : "GIVE/TAKE_ITEM target"
    CHARACTERS    }o--o| EFFECTS      : "start_effect_group"
    THRESHOLDS    }o--o| EVENTS       : "event"
    THRESHOLDS    }o--o| EFFECTS      : "effect"
    ENEMIES       }o--|| TILES        : "start"
    ENEMIES       }o--o| EVENTS       : "event (접촉)"
    ENEMIES       }o--o| ASSETS       : "sprite (전역)"
    ENEMIES       }o--o| CONDITIONS   : "cond_group"
    ITEMS         }o--o| EFFECTS      : "use_effect_group"
    ITEMS         }o--o| CONDITIONS   : "cond_group"
    ENDINGS       }o--o| CONDITIONS   : "cond_group"
    TILE_EVENTS   }o--|| EVENTS       : "event_id"
    EVENTS        }o--o| CONDITIONS   : "cond_group"
    CHOICES       }o--o| CONDITIONS   : "cond_group"
    TILE_EVENTS   }o--o| CONDITIONS   : "cond_group"
    EDGES         }o--o| CONDITIONS   : "cond_group"
```

## 읽는 순서

1. **STAGES**(전역) → 각 행이 한 스테이지. `config_path`가 가리키는 폴더에 스테이지 표들이 들어 있다.
2. **STATS**(전역) → 플레이어가 들고 다니는 자원·상태. `kind`로 자원(number/bool)과 지속 상태(status)를 가른다. 다른 테이블의 `target`/`subject`가 여기를 가리킨다.
3. **CONFIG**(스테이지) → 그 보드의 시작/목표 타일, 시드, 주사위, 턴 훅, 패배 조건 등.
4. **TILES + EDGES**(스테이지) → 보드의 칸과 연결. `type`/`event_id`가 비면 전역 **GENERATION**으로 채운다.
5. **EVENTS → CHOICES → EFFECTS**(스테이지) → 칸에 도착했을 때 벌어지는 일. effects는 같은 `group_id`를 `seq` 순서로 실행한다. 조건은 **CONDITIONS**를 `cond_group`(→ `group_id`)으로 참조.
6. **GENERATION / TILE_EVENTS** → 빈 칸을 채우는 규칙(전역)과, 타입별 도착 이벤트 풀(스테이지).

## 이벤트 해석 우선순위

칸에 도착하면:

1. `tiles.event_id`가 있으면 그 이벤트 실행 (사전 배치, 1순위).
2. 없으면 `tiles.type`으로 **TILE_EVENTS** 풀에서 조건 통과 행만 추려 가중치 추첨.
3. 그래도 없으면 아무 일도 없음.

## surrogate id 규약

`EDGES`·`GENERATION`·`TILE_EVENTS`·`DERIVED`·`CHOICES`·`CONDITIONS`의 `id`는 행을 가리키는 **형식상
surrogate**다(참조엔 `from/to`·`region/tile_type`·`group_id` 같은 자연키를 쓴다). 의미를 담지 말고
숫자 범위 인덱스(`100001~`)로 적는다. 반면 `tiles.id`·`events.id`·`effects.group_id`·`conditions.group_id`·`stats.id`는
이름으로 가리켜지는 business 키라 의미 있는 이름을 유지한다.

> STAGES·META·STATS·DERIVED·GENERATION·ASSETS는 스테이지 폴더가 아니라 데이터 루트(`public/resources/data/`)에 있는 **전역 테이블**이다.
