import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { CampaignService } from '../../../core/services/campaign.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../core/services/toast.service';
import { Campaign, CampaignFundUse } from '../../../core/models/campaign.model';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ImageUploadComponent } from '../../../shared/components/image-upload/image-upload.component';

const MAX_CAMPAIGN_DURATION_DAYS = 30;

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function futureDateValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const chosen = new Date(control.value);
  const today = startOfToday();
  return chosen >= today ? null : { pastDate: true };
}

export interface EditCampaignForm {
  title: FormControl<string>;
  description: FormControl<string>;
  fundUse: FormControl<CampaignFundUse | null>;
  deadline: FormControl<string | null>;
  customMessage: FormControl<string>;
}

@Component({
  selector: 'app-campaign-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, ImageUploadComponent],
  templateUrl: './campaign-edit.component.html',
  styleUrl: './campaign-edit.component.scss',
})
export class CampaignEditComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly campaignSvc = inject(CampaignService);
  private readonly supabaseSvc = inject(SupabaseService);
  private readonly toastSvc = inject(ToastService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly campaign = signal<Campaign | null>(null);
  readonly hasContributions = signal(false);

  readonly todayIso = formatDateInputValue(startOfToday());
  readonly maxDateIso = signal<string>('2099-12-31');

  readonly form: FormGroup<EditCampaignForm> = this.fb.group({
    title: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(80),
    ]),
    description: this.fb.nonNullable.control('', [
      Validators.maxLength(500),
    ]),
    fundUse: this.fb.control<CampaignFundUse | null>(null),
    deadline: this.fb.control<string | null>(null, [
      Validators.required,
      futureDateValidator,
    ]),
    customMessage: this.fb.nonNullable.control('', [
      Validators.maxLength(1000),
    ]),
  });

  private readonly destroy$ = new Subject<void>();

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('id') ?? '';

    try {
      const campaign = await this.campaignSvc.getCampaignBySlug(slug);
      if (!campaign) {
        this.loadError.set('Celebration not found.');
        return;
      }

      this.campaign.set(campaign);
      this.maxDateIso.set(this.getCampaignMaxDateIso(campaign));
      this.populateForm(campaign);

      const totals = await this.supabaseSvc.getCampaignTotals(campaign.id);
      if (totals.count > 0) {
        this.hasContributions.set(true);
        this.form.controls.title.disable({ emitEvent: false });
        this.form.controls.deadline.disable({ emitEvent: false });
      }
    } catch {
      this.loadError.set('Failed to load celebration.');
    } finally {
      this.loading.set(false);
    }

    this.form.controls.deadline.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => this.form.controls.deadline.updateValueAndValidity({ emitEvent: false }));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private populateForm(campaign: Campaign): void {
    this.form.controls.deadline.setValidators([
      Validators.required,
      futureDateValidator,
      this.maxDeadlineValidator(campaign),
    ]);
    this.form.controls.deadline.updateValueAndValidity({ emitEvent: false });

    this.form.patchValue({
      title: campaign.title,
      description: campaign.description ?? '',
      fundUse: campaign.fundUse ?? null,
      deadline: campaign.endsAt ? campaign.endsAt.split('T')[0] : null,
      customMessage: campaign.customMessage ?? '',
    });
  }

  private maxDeadlineValidator(campaign: Campaign) {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;

      const chosen = new Date(control.value);
      const maxDate = addDays(startOfDay(new Date(campaign.createdAt)), MAX_CAMPAIGN_DURATION_DAYS);
      return chosen <= maxDate ? null : { maxCampaignLength: true };
    };
  }

  private getCampaignMaxDateIso(campaign: Campaign): string {
    const maxDate = addDays(startOfDay(new Date(campaign.createdAt)), MAX_CAMPAIGN_DURATION_DAYS);
    return formatDateInputValue(maxDate);
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    const campaign = this.campaign();
    if (this.form.invalid || this.submitting() || !campaign) return;

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      const { title, description, fundUse, deadline, customMessage } = this.form.getRawValue();

      await this.campaignSvc.updateCampaign(campaign.id, {
        title,
        description: description || undefined,
        fundUse: fundUse ?? null,
        deadline: deadline || null,
        customMessage: campaign.isPro ? (customMessage || undefined) : undefined,
      });

      this.toastSvc.success('Celebration updated successfully.');
      await this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      this.submitError.set(message);
      this.submitting.set(false);
    }
  }

  hasError(controlName: keyof EditCampaignForm, error: string): boolean {
    const ctrl = this.form.get(controlName);
    return !!(ctrl?.touched && ctrl.hasError(error));
  }

  get descriptionLength(): number {
    return this.form.controls.description.value.length;
  }

  get customMessageLength(): number {
    return this.form.controls.customMessage.value.length;
  }

  get maxCampaignDurationDays(): number {
    return MAX_CAMPAIGN_DURATION_DAYS;
  }
}
