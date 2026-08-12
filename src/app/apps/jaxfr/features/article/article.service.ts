import { Injectable, inject, NgZone, signal } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { Article } from './article.model';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  articles = signal<Article[]>([]);
  loading = signal(false);

  async fetchAllArticles(force = false) {
    if (this.articles().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_article')
        .select('*')
        .is('deleted_at', null)
        .order('publish_date', { ascending: false })
        .order('tb_tyapp_atcl_seq_no', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.articles.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Articles Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchArticleById(id: string): Promise<Article | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_article')
        .select('*')
        .eq('tb_tyapp_atcl_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as Article;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Article Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveArticle(articleData: Partial<Article>): Promise<boolean> {
    const isNew = !articleData.tb_tyapp_atcl_id;
    const {
      tb_tyapp_atcl_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = articleData;

    this.loading.set(true);

    const query = isNew
      ? this.supabase.from('tyapp_article').insert(payload).select().single()
      : this.supabase
          .from('tyapp_article')
          .update(payload)
          .eq('tb_tyapp_atcl_id', articleData.tb_tyapp_atcl_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as Article;
        this.articles.update((list) =>
          isNew
            ? [saved, ...list]
            : list.map((item) =>
                item.tb_tyapp_atcl_id === saved.tb_tyapp_atcl_id ? saved : item,
              ),
        );
        this.loading.set(false);
        this.notification.showSuccess('Article saved successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async deleteArticle(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_article_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.articles.update((list) =>
          list.filter((item) => item.tb_tyapp_atcl_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Article deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }
}
