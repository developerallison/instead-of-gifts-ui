import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { ProService } from '../../../core/services/pro.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';

interface PlanFeature {
  label: string;
  included: boolean;
}

@Component({
  selector: 'app-upgrade',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './upgrade.component.html',
  styleUrl: './upgrade.component.scss',
})
export class UpgradeComponent {
  private readonly router = inject(Router);

  readonly campaignCredits = inject(ProService).campaignCredits;

  readonly freeFeatures: PlanFeature[] = [
    { label: 'Campaign Pro upgrade', included: false },
    { label: 'Shareable campaign link', included: true },
    { label: 'Contribution tracking', included: true },
    { label: 'Cover photos', included: false },
    { label: 'Custom thank-you message', included: false },
    { label: 'QR code sharing', included: false },
    { label: 'Priority support', included: false },
  ];

  readonly proFeatures: PlanFeature[] = [
    { label: 'Campaign Pro unlock ($9.99 each)', included: true },
    { label: 'Shareable campaign link', included: true },
    { label: 'Contribution tracking', included: true },
    { label: 'Cover photos', included: true },
    { label: 'Custom thank-you message', included: true },
    { label: 'QR code sharing', included: true },
    { label: 'Priority support', included: true },
  ];

  async onContinueFree(): Promise<void> {
    await this.router.navigate(['/campaigns/new']);
  }

  async onUpgrade(): Promise<void> {
    await this.router.navigate(['/pro/upgrade/payment']);
  }
}
