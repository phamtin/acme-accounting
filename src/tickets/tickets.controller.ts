import { Body, ConflictException,BadRequestException, Controller, Get, Post } from '@nestjs/common';
import { Op } from 'sequelize';
import { Company } from '../../db/models/Company';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { User, UserRole } from '../../db/models/User';

interface newTicketDto {
  type: TicketType;
  companyId: number;
}

interface TicketDto {
  id: number;
  type: TicketType;
  companyId: number;
  assigneeId: number;
  status: TicketStatus;
  category: TicketCategory;
}

@Controller('api/v1/tickets')
export class TicketsController {
  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() newTicketDto: newTicketDto) {
    const { type, companyId } = newTicketDto;

    if (!Object.values(TicketType).includes(type)) {
      throw new BadRequestException("Invalid ticket type");
    }

    if (type === TicketType.managementReport) {
      return this.createTicketManagementReport(companyId);
    }

    if (type === TicketType.registrationAddressChange) {
      return this.createTicketAddressChange(companyId);
    }

    throw new BadRequestException("Unsupported ticket type");
  }

  private async createTicketManagementReport(companyId: number) {
    const ticketType = TicketType.managementReport;
    const category = TicketCategory.accounting;
    const userRole = UserRole.accountant;

    const assignees = await User.findAll({
      where: { companyId, role: userRole },
      order: [['createdAt', 'DESC']],
    });

    if (!assignees.length) 
      throw new ConflictException("Cannot find accountant to create a ticket");

    const assignee = assignees[0];

    return (await this.createTicket(assignee.id, companyId, category, ticketType));
  }

  private async createTicketAddressChange(companyId: number) {
    const ticketType = TicketType.registrationAddressChange;
    const category = TicketCategory.corporate;
    const userRoles = [UserRole.corporateSecretary, UserRole.director];

    const [existingTicket, assignees] = await Promise.all([
      Ticket.findOne({ 
        where: {
          companyId,
          type: ticketType,
        },
      }),
      User.findAll({
        where: { 
          companyId, 
          role: { [Op.in]: userRoles } 
        },
        order: [['createdAt', 'DESC']],
      }),
    ])
    if (existingTicket) 
      throw new ConflictException("Ticket already exists");

    if (!assignees.length) 
      throw new ConflictException("Cannot find secretary or director to create a ticket");

    let secretaryCount = 0;
    let directorCount = 0;
    let secretary: User | null = null;
    let director: User | null = null;

    for (const assignee of assignees) {
      if (assignee.role === UserRole.corporateSecretary) {
        secretaryCount++;
        secretary = assignee;
      }
      if (assignee.role === UserRole.director) {
        directorCount++;
        director = assignee;
      }
    }
    if (secretaryCount > 1) 
      throw new ConflictException("Multiple users with role Corporate Secretary. Cannot create a ticket");
    
    if (directorCount > 1) 
      throw new ConflictException("Multiple users with role Director. Cannot create a ticket");
    
    const assignee = (secretary || director) as User;

    return (await this.createTicket(assignee.id, companyId, category, ticketType));
  }

  private async createTicket(assigneeId: number, companyId: number, category: TicketCategory, ticketType: TicketType) {
    const ticket = await Ticket.create({
      assigneeId,
      companyId,
      category,
      type: ticketType,
      status: TicketStatus.open,
    });

    const ticketDto: TicketDto = {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };

    return ticketDto;
  }
}
