import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { Campaign } from '../../core/models/campaign.model';
import { CampaignService } from '../../core/services/campaign.service';
import { StripeService } from '../../core/services/stripe.service';
import { ButtonComponent } from '../../shared/components/button/button.component';

const PRESET_AMOUNTS = [5, 10, 25, 50] as const;
type PresetAmount = (typeof PRESET_AMOUNTS)[number];

interface ContributeForm {
  name: FormControl<string>;
  message: FormControl<string>;
  isAnonymous: FormControl<boolean>;
}

@Component({
  selector: 'app-contribute',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent],
  templateUrl: './contribute.component.html',
  styleUrl: './contribute.component.scss',
})
export class ContributeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly campaignSvc = inject(CampaignService);
  private readonly stripeSvc = inject(StripeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly presets = PRESET_AMOUNTS;

  readonly campaign = signal<Campaign | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly loading = signal(true);

  readonly selectedPreset = signal<PresetAmount | 'custom'>(10);
  readonly customAmountRaw = signal('');

  readonly amountPence = computed(() => {
    if (this.selectedPreset() === 'custom') {
      const value = parseFloat(this.customAmountRaw());
      return Number.isNaN(value) || value <= 0 ? 0 : Math.round(value * 100);
    }

    return (this.selectedPreset() as PresetAmount) * 100;
  });

  readonly amountValid = computed(() => this.amountPence() >= 100);
  readonly amountTouched = signal(false);

  readonly paying = signal(false);
  readonly payError = signal<string | null>(null);
  readonly wasCancelled = signal(false);
  readonly donationsEnabled = computed(() => this.campaign()?.stripeOnboardingComplete === true);

  readonly form: FormGroup<ContributeForm> = this.fb.group({
    name: this.fb.nonNullable.control(''),
    message: this.fb.nonNullable.control('', [Validators.maxLength(200)]),
    isAnonymous: this.fb.nonNullable.control(false),
  });

  async ngOnInit(): Promise<void> {
    this.form.controls.isAnonymous.valueChanges
      .pipe(startWith(this.form.controls.isAnonymous.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((isAnonymous) => {
        const nameControl = this.form.controls.name;
        if (isAnonymous) {
          nameControl.disable({ emitEvent: false });
          nameControl.clearValidators();
          nameControl.setValue('', { emitEvent: false });
        } else {
          nameControl.enable({ emitEvent: false });
          nameControl.setValidators([Validators.required]);
        }
        nameControl.updateValueAndValidity({ emitEvent: false });
      });

    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const cancelled = this.route.snapshot.queryParamMap.get('payment_cancelled');
    if (cancelled === 'true') {
      this.wasCancelled.set(true);
    }

    try {
      const campaign = await this.campaignSvc.getCampaignBySlug(slug);
      if (!campaign) {
        this.loadError.set('Celebration not found.');
        return;
      }

      if (campaign.status === 'closed') {
        this.loadError.set('This celebration has ended.');
        return;
      }

      this.campaign.set(campaign);
    } catch {
      this.loadError.set('Failed to load celebration. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  selectPreset(amount: PresetAmount): void {
    this.selectedPreset.set(amount);
    this.customAmountRaw.set('');
    this.amountTouched.set(false);
  }

  onCustomInput(event: Event): void {
    this.selectedPreset.set('custom');
    this.customAmountRaw.set((event.target as HTMLInputElement).value);
    this.amountTouched.set(true);
  }

  onCustomFocus(): void {
    this.selectedPreset.set('custom');
  }

  async onSubmit(): Promise<void> {
    this.amountTouched.set(true);
    this.form.markAllAsTouched();

    if (!this.amountValid() || this.form.invalid || this.paying()) {
      return;
    }

    const campaign = this.campaign();
    if (!campaign) {
      return;
    }

    if (!this.donationsEnabled()) {
      this.payError.set(
        'Donations are currently disabled until the organiser connects Stripe and adds bank account details.',
      );
      return;
    }

    this.paying.set(true);
    this.payError.set(null);
    this.wasCancelled.set(false);

    const { name, message, isAnonymous } = this.form.getRawValue();
    const contributorName = isAnonymous ? 'Anonymous' : name.trim();
    const origin = window.location.origin;
    const successUrl =
      `${origin}/celebrations/${campaign.slug}?contributed=true&provider=stripe&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/contribute/${campaign.slug}?payment_cancelled=true&provider=stripe`;

    try {
      await this.stripeSvc.redirectToCheckout({
        campaignId: campaign.id,
        amountPence: this.amountPence(),
        contributorName,
        message: message.trim(),
        isAnonymous,
        successUrl,
        cancelUrl,
      });
    } catch (err: unknown) {
      this.payError.set(err instanceof Error ? err.message : 'Payment could not be started.');
      this.paying.set(false);
    }
  }

  retry(): void {
    this.payError.set(null);
    this.wasCancelled.set(false);
  }

  get messageLength(): number {
    return this.form.controls.message.value.length;
  }

  hasError(ctrl: keyof ContributeForm, err: string): boolean {
    const control = this.form.get(ctrl);
    return !!(control?.touched && control.hasError(err));
  }
}
