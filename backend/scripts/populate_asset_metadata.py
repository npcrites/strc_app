"""
Script to populate asset metadata with known instrument characteristics
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.asset_metadata import AssetMetadata, DividendCalculationType
from decimal import Decimal

def populate_asset_metadata():
    """Populate asset metadata with known instrument characteristics"""
    db = SessionLocal()
    
    try:
        assets = [
            {
                'ticker': 'STRC',
                'dividend_calculation_type': DividendCalculationType.FIXED_PERCENTAGE_RATE,
                'dividend_rate_percentage': Decimal('11.00'),  # 11% annual rate
                'fixed_dividend_per_share': None,  # Not applicable
                'is_cumulative': True,
                'dividend_frequency': 'monthly',
                'special_features': None
            },
            {
                'ticker': 'STRD',
                'dividend_calculation_type': DividendCalculationType.FIXED_DOLLAR_PER_SHARE,
                'dividend_rate_percentage': None,  # Not applicable
                'fixed_dividend_per_share': Decimal('2.50'),  # $2.50 per share quarterly ($10 per year)
                'is_cumulative': False,
                'dividend_frequency': 'quarterly',
                'special_features': None
            },
            {
                'ticker': 'STRK',
                'dividend_calculation_type': DividendCalculationType.FIXED_DOLLAR_PER_SHARE,
                'dividend_rate_percentage': None,
                'fixed_dividend_per_share': Decimal('2.00'),  # $2.00 per share quarterly ($8 per year)
                'is_cumulative': False,
                'dividend_frequency': 'quarterly',
                'special_features': 'convertible to MSTR shares'
            },
            {
                'ticker': 'STRF',
                'dividend_calculation_type': DividendCalculationType.FIXED_DOLLAR_PER_SHARE,
                'dividend_rate_percentage': None,
                'fixed_dividend_per_share': Decimal('2.50'),  # $2.50 per share quarterly ($10 per year)
                'is_cumulative': False,
                'dividend_frequency': 'quarterly',
                'special_features': None
            },
            {
                'ticker': 'SATA',
                'dividend_calculation_type': DividendCalculationType.FIXED_PERCENTAGE_RATE,
                'dividend_rate_percentage': Decimal('12.25'),  # 12.25% annual rate
                'fixed_dividend_per_share': None,
                'is_cumulative': True,
                'dividend_frequency': 'monthly',
                'special_features': None
            },
        ]
        
        for asset_data in assets:
            metadata = db.query(AssetMetadata).filter(
                AssetMetadata.ticker == asset_data['ticker']
            ).first()
            
            if metadata:
                # Update existing
                for key, value in asset_data.items():
                    setattr(metadata, key, value)
                print(f"✅ Updated metadata for {asset_data['ticker']}")
            else:
                # Create new
                metadata = AssetMetadata(**asset_data)
                db.add(metadata)
                print(f"✅ Created metadata for {asset_data['ticker']}")
        
        db.commit()
        print("\n✅ Asset metadata populated successfully")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error populating asset metadata: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    populate_asset_metadata()

