export interface MacCMSBaseResponse<T = any> {
  code: number
  msg: string
  page?: number
  pagecount?: number
  limit?: string
  total?: number
  list?: T[]
  class?: T[]
}

export interface MacCMSVideo {
  vod_id: number
  type_id: number
  type_id_1: number
  group_id: number
  vod_name: string
  vod_sub: string
  vod_en: string
  vod_status: number
  vod_letter: string
  vod_color: string
  vod_tag: string
  vod_class: string
  vod_pic: string
  vod_pic_thumb: string
  vod_pic_slide: string
  vod_pic_screenshot: string
  vod_actor: string
  vod_director: string
  vod_writer: string
  vod_behind: string
  vod_blurb: string
  vod_remarks: string
  vod_pubdate: string
  vod_total: number
  vod_serial: string
  vod_tv: string
  vod_weekday: string
  vod_area: string
  vod_lang: string
  vod_year: string
  vod_version: string
  vod_state: string
  vod_author: string
  vod_jumpurl: string
  vod_tpl: string
  vod_tpl_play: string
  vod_tpl_down: string
  vod_isend: number
  vod_lock: number
  vod_level: number
  vod_copyright: number
  vod_points: number
  vod_points_play: number
  vod_points_down: number
  vod_hits: number
  vod_hits_day: number
  vod_hits_week: number
  vod_hits_month: number
  vod_duration: string
  vod_up: number
  vod_down: number
  vod_score: string
  vod_score_all: number
  vod_score_num: number
  vod_time: string
  vod_time_add: number
  vod_time_hits: number
  vod_time_make: number
  vod_trysee: number
  vod_douban_id: number
  vod_douban_score: string
  vod_reurl: string
  vod_rel_vod: string
  vod_rel_art: string
  vod_pwd: string
  vod_pwd_url: string
  vod_pwd_play: string
  vod_pwd_play_url: string
  vod_pwd_down: string
  vod_pwd_down_url: string
  vod_content: string
  vod_play_from: string
  vod_play_server: string
  vod_play_note: string
  vod_play_url: string
  vod_down_from: string
  vod_down_server: string
  vod_down_note: string
  vod_down_url: string
  vod_plot: number
  vod_plot_name: string
  vod_plot_detail: string
  type_name?: string
}

export interface MacCMSCategory {
  type_id: number
  type_name: string
  type_en: string
  type_sort: number
  type_mid: number
  type_pid: number
  type_status: number
  type_tpl: string
  type_tpl_list: string
  type_tpl_detail: string
  type_tpl_play: string
  type_tpl_down: string
  type_key: string
  type_des: string
  type_title: string
  type_union: string
  type_extend: string
  type_logo: string
  type_pic: string
  type_jumpurl: string
}

export interface MacCMSActor {
  actor_id: number
  actor_name: string
  actor_en: string
  actor_alias: string
  actor_status: number
  actor_lock: number
  actor_letter: string
  actor_sex: string
  actor_color: string
  actor_pic: string
  actor_blurb: string
  actor_remarks: string
  actor_area: string
  actor_height: string
  actor_weight: string
  actor_birthday: string
  actor_birtharea: string
  actor_blood: string
  actor_starsign: string
  actor_school: string
  actor_works: string
  actor_tag: string
  actor_class: string
  actor_level: number
  actor_time: string
  actor_time_add: number
  actor_time_hits: number
  actor_time_make: number
  actor_hits: number
  actor_hits_day: number
  actor_hits_week: number
  actor_hits_month: number
  actor_score: string
  actor_score_all: number
  actor_score_num: number
  actor_up: number
  actor_down: number
  actor_tpl: string
  actor_jumpurl: string
  actor_content: string
}

export interface MacCMSPlaySource {
  name: string
  urls: Array<{
    title: string
    url: string
  }>
}

export interface MacCMSFilterParams {
  ac?: 'list' | 'detail' | 'videolist'
  t?: number | string
  pg?: number
  wd?: string
  h?: number
  ids?: string
  at?: string
  ct?: string
  year?: string
  area?: string
  lang?: string
  letter?: string
  by?: string
  sort?: string
  limit?: number
}

export interface MacCMSSearchParams {
  wd: string
  ac?: 'list' | 'detail'
  t?: number | string
  pg?: number
  limit?: number
}

export enum MacCMSApiAction {
  LIST = 'list',
  DETAIL = 'detail',
  VIDEOLIST = 'videolist'
}

export enum MacCMSSortBy {
  TIME = 'time',
  HITS = 'hits',
  SCORE = 'score'
}

export enum MacCMSSortOrder {
  ASC = 'asc',
  DESC = 'desc'
}
