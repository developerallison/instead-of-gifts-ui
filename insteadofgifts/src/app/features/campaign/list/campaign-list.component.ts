import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Campaign } from '../../../core/models/campaign.model';
import { CampaignService } from '../../../core/services/campaign.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CampaignCardComponent } from '../../../shared/components/campaign-card/campaign-card.component';

@Component({
  selector: 'app-campaign-list',
  standalone: true,
  imports: [CampaignCardComponent],
  templateUrl: './campaign-list.component.html',
  styleUrl: './campaign-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampaignListComponent {
  private readonly campaignSvc = inject(CampaignService);
  private readonly supabaseSvc = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly campaigns = signal<Campaign[]>([]);
  readonly searchTerm = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasSearched = signal(false);
  readonly hasLoadedCampaigns = signal(false);
  readonly activeCount = computed(() => this.campaigns().length);
  readonly normalizedSearchTerm = computed(() => this.searchTerm().trim().toLowerCase());
  readonly filteredCampaigns = computed(() => {
    const query = this.normalizedSearchTerm();
    if (!query) return this.campaigns();

    return this.campaigns().filter((campaign) =>
      campaign.title.toLowerCase().includes(query) ||
      campaign.slug.toLowerCase().includes(query)
    );
  });

  private async loadCampaigns(): Promise<void> {
    if (this.hasLoadedCampaigns()) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const campaigns = await this.campaignSvc.getActiveCampaigns();
      const totals = await Promise.all(
        campaigns.map((campaign) => this.supabaseSvc.getCampaignTotals(campaign.id))
      );

      this.campaigns.set(
        campaigns.map((campaign, index) => ({
          ...campaign,
          amountCollected: totals[index]?.totalPence ?? 0,
        }))
      );
      this.hasLoadedCampaigns.set(true);
    } catch (error) {
      console.error(error);
      this.error.set('Failed to load active celebrations.');
    } finally {
      this.loading.set(false);
    }
  }

  async onShare(campaign: Campaign): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const url = `${window.location.origin}/celebrations/${campaign.slug}`;
    const shareData: ShareData = {
      title: campaign.title,
      text: `Contribute to "${campaign.title}"`,
      url,
    };

    if ('share' in navigator && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  }

  async onSearchInput(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement | null;
    const value = target?.value ?? '';
    this.searchTerm.set(value);

    if (!value.trim()) {
      this.hasSearched.set(false);
      this.error.set(null);
      return;
    }

    this.hasSearched.set(true);
    await this.loadCampaigns();
  }
}
